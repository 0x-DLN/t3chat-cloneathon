import ChatTest from "~/components/chat-test";

export default async function Page({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  return <ChatTest conversationId={conversationId} />;
}
