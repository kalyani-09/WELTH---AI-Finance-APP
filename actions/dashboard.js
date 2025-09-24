"use server"

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";


const serializedTransaction = (obj) => {
    const serialized = { ...obj };
    if (obj.balance) {
        serialized.balance = obj.balance.toNumber();
    }

    if(obj.amount){
        serialized.amount=obj.amount.toNumber();
    }
    return serialized;
};

export async function getUserAccounts() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) {
    throw new Error("User not found");
  }

  try {
    const accounts = await db.account.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            transactions: true,
          },
        },
      },
    });

    // Serialize accounts before sending to client
    const serializedAccounts = accounts.map(serializedTransaction);

    return serializedAccounts;
  } catch (error) {
    console.error(error.message);
  }
};
export async function createAccount(data) {

    try {
        const { userId } = await auth();
        if (!userId) {
            throw new Error('Unauthorized');
        }
        const user = await db.user.findUnique({
            where: { clerkUserId: userId },
        });

        if (!user) {
            throw new Error("User Not found");
        }


        //COnvert balance amount to float value before saving
        const balanceFloat = parseFloat(data.balance);
        if (isNaN(balanceFloat)) {
            throw new Error("Invalid balance amount");
        }

        //Check if this is the users first account
        const existingAccount = await db.account.findMany({
            where: { userId: user.id },
        });


        //If thsi account should be default , unset other default accounts
        const shouldBeDefault = existingAccount.length === 0 ? true : data.isDefault;
        if (shouldBeDefault) {
            await db.account.updateMany({
                where: { userId: user.id, isDefault: true },
                data: { isDefault: false },
            });
        }


        const account = await db.account.create(
            {
                data: {
                    ...data,
                    balance: balanceFloat,
                    userId: user.id,
                    isDefault: shouldBeDefault,
                }
            }
        )
        const serializedAccount = serializedTransaction(account);
        revalidatePath("/dashboard");///refetch all the data

        return { success: true, data: serializedAccount };
    }
    catch (error) {
        throw new Error(error.message)
    }
}

export async function getDashboardData() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Get all user transactions
  const transactions = await db.transaction.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
  });

  return transactions.map(serializedTransaction);
}