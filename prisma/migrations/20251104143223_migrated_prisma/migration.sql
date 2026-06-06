-- CreateTable
CREATE TABLE "Reply" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "replyText" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "snippetIds" TEXT[],
    "outcome" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QaSnapshot" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" INTEGER NOT NULL,
    "escalated" INTEGER NOT NULL,
    "duplicates" INTEGER NOT NULL,
    "p50Len" INTEGER NOT NULL,

    CONSTRAINT "QaSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reply_messageId_threadId_idx" ON "Reply"("messageId", "threadId");
