import { PrismaClient } from "@prisma/client";

// Jeden spolocny PrismaClient pre cely proces.
export const prisma = new PrismaClient();
