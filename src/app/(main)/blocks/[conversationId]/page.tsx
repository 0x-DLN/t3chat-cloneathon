import AiChat from "~/components/ai-chat";

export default async function Page({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  return <AiChat conversationId={conversationId} />;
}
