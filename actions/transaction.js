"use server"

import {auth} from "@clerk/nextjs/server";
import { db } from "@/lib/prisma";
import {request} from "@arcjet/next";
import { revalidatePath } from "next/cache";
import { GoogleGenerativeAI } from "@google/generative-ai";
import aj from "@/lib/arcjet";


const genAI=  new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// const serializeAmount = (obj)=>({
//     ...obj,
//      accountId: String(transaction.accountId),
//     amount:obj.amount.toNumber(),

    
// });
const serializeAmount = (obj) => {
    const serialized = { ...obj };
    if (obj.accountId!=null) {
        serialized.accountId = String(obj.accountId);
    }

    if(obj.amount!=null){
        serialized.amount=typeof obj.amount.toNumber()=="function"
        ? obj.amount.toNumber()
        : Number(obj.amount);
    }
    // Optionally convert balance if exists
  if (obj.balance != null) {
    serialized.balance = typeof obj.balance.toNumber === "function"
      ? obj.balance.toNumber()
      : Number(obj.balance);
  }
    return serialized;
};


// Create Transaction
export async function createTransaction(data) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    // Get request data for ArcJet
    const req = await request();

    // Check rate limit
    const decision = await aj.protect(req, {
      userId,
      requested: 1, // Specify how many tokens to consume
    }); 

    

// 
    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        const { remaining, reset } = decision.reason;
        console.error({
          code: "RATE_LIMIT_EXCEEDED",
          details: {
            remaining,
            resetInSeconds: reset,
          },
        });

        throw new Error("Too many requests. Please try again later.");
      }

      throw new Error("Request blocked");
    }

    const user = await db.user.findUnique({
      where: { clerkUserId: userId },
    });

    if (!user) {
      throw new Error("User not found");
    }

    const account = await db.account.findUnique({
      where: {
        id: data.accountId,
        userId: user.id,
      },
    });

    if (!account) {
      throw new Error("Account not found");
    }

    // Calculate new balance
    const balanceChange = data.type === "EXPENSE" ? -data.amount : data.amount;
    const newBalance = account.balance.toNumber() + balanceChange;

    // Create transaction and update account balance
    const transaction = await db.$transaction(async (tx) => {
      const newTransaction = await tx.transaction.create({
        data: {
          ...data,
          userId: user.id,
          nextRecurringDate:
            data.isRecurring && data.recurringInterval
              ? calculateNextRecurringDate(data.date, data.recurringInterval)
              : null,
        },
      });

      await tx.account.update({
        where: { id: data.accountId },
        data: { balance: newBalance },
      });
      console.log(newTransaction);
      return newTransaction;
    });

    revalidatePath("/dashboard");
    revalidatePath(`/account/${transaction.accountId}`);

    return { success: true, data: serializeAmount(transaction) };
  } catch (error) {
    throw new Error(error.message);
  }
}

function calculateNextRecurringDate(startDate,interval){
    const date=new Date(startDate);
    switch(interval){
        case "DAILY":
            date.setDate(date.getDate()+1);
            break;
        case "WEEKLY" : 
            date.setDate(date.getDate()+7);
            break;
         case "MONTHLY" : 
            date.setDate(date.getMonth()+1);
            break;
         case "WEEKLY" : 
            date.setDate(date.getFullYear()+1);
            break;

    }
    return date;
}


export async function scanReceipt(file) {
   try{
    const model = genAI.getGenerativeModel({model :"gemini-1.5-flash"});

    //Convert ArrayBuffer to Base64
 const arrayBuffer = await file.arrayBuffer();
    const base64String = Buffer.from(arrayBuffer).toString("base64");

  const prompt =`Analyze this receipt image and extract the following information in JSON format:
      - Total amount (just the number)
      - Date (in ISO format)
      - Description or items purchased (brief summary)
      - Merchant/store name
      - Suggested category (one of: housing,transportation,groceries,utilities,entertainment,food,shopping,healthcare,education,personal,travel,insurance,gifts,bills,other-expense )
      
      Only respond with valid JSON in this exact format:
      {
        "amount": number,
        "date": "ISO date string",
        "description": "string",
        "merchantName": "string",
        "category": "string"
      }

      If its not a recipt, return an empty objec`;

  const result= await model.generateContent([
    {
      inlineData:{
        data:base64String,
        mimeType:file.type,
      },
      
    },
    prompt,
  ]);

  const response= await result.response;
  const text=response.text();
  const cleanedText=text.replace(/```(?:json)?\n?/g,"").trim();
  try{
    const data=JSON.parse(cleanedText);
    return{
      amount:parseFloat(data.amount),
      date:new Date(data.date),
      description:data.description,
      category:data.category,
      merchantName:data.merchantName,
    };
    
  }catch(parseError){
      console.error("Eror parsing JSON response:",parseError);
      throw new Error("Invalid response format from Gemini")
   }
  }
   catch(error){
    console.error("Failed to scan the Receipt")
    throw new Error(error.message);
   }
}


export async function getTransaction(id){
  const {userId} = await auth();
  if(!userId){
    throw new Error("Unauthorized"); 
  }

  const user = await db.user.findUnique({
    where:{
      clerkUserId : userId
    },

  });

  if (!user) throw new Error("User Not Found");

  const transaction= await db.transaction.findUnique({
    where:{
      id,
      userId:user.id,
    },
  });

  if(!transaction) throw new Error("Transaction Not Found");

  return serializeAmount(transaction);

}

export async function updateTransaction(id, data) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await db.user.findUnique({
      where: { clerkUserId: userId }, // ✅ fixed key + correct variable
    });

    if (!user) throw new Error("User Not Found");

    // Get original transaction
    const originalTransaction = await db.transaction.findUnique({
      where: { id },
      include: { account: true },
    });

    if (!originalTransaction || originalTransaction.userId !== user.id) {
      throw new Error("Transaction Not Found");
    }

    // Calculate balance changes
    const oldBalanceChange =
      originalTransaction.type === "EXPENSE"
        ? -originalTransaction.amount.toNumber()
        : originalTransaction.amount.toNumber();

    const newBalanceChange =
      data.type === "EXPENSE" ? -data.amount : data.amount;

    const netBalanceChange = newBalanceChange - oldBalanceChange;

    // Update transaction and account in a transaction
    const updatedTransaction = await db.$transaction(async (tx) => {
      const update = await tx.transaction.update({
        where: { id },
        data: {
          ...data,
          nextRecurringDate:
            data.isRecurring && data.recurringInterval
              ? calculateNextRecurringDate(data.date, data.recurringInterval)
              : null,
        },
      });

      await tx.account.update({
        where: { id: data.accountId },
        data: {
          balance: {
            increment: netBalanceChange,
          },
        },
      });

      return update; // ✅ return updated transaction
    });

    revalidatePath("/dashboard");
    revalidatePath(`/account/${data.accountId}`);
 
    console.log(serializeAmount(updatedTransaction));
   return {
  success: true,
  message: "Transaction updated successfully",
  data: serializeAmount(updatedTransaction),
};
 // ✅ return result
  } catch (error) {
    console.log(error.message);
    throw new Error(error.message);
  }
}


export async function getDashboardData(){
  const {userId }= await auth();
  if(!userId){
    throw new Error("Unauthorized");
  }

  const user = await db.user.findUnique({
    where:{
      clerUserId:userId
    }
  });
  if(!user){
    throw new Error("User not Found");
  }

  //Get all user transactions
  const transactions = await db.transaction.findMany({
    where:{userId:user.id},
    orderBy:{date :"desc"},
  });

  return transactions.map(serializeTransaction);
}



