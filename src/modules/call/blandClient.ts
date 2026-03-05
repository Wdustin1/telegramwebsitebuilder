import { env } from "../../config/env.js";

interface CallRequest {
  phoneNumber: string;
  prompt: string;
  webhookUrl: string;
}

interface CallResponse {
  call_id: string;
  status: string;
}

export async function makeCall(request: CallRequest): Promise<CallResponse> {
  const response = await fetch("https://api.bland.ai/v1/calls", {
    method: "POST",
    headers: {
      Authorization: env.BLAND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phone_number: request.phoneNumber,
      task: request.prompt,
      voice: "mason",
      wait_for_greeting: true,
      webhook: request.webhookUrl,
      max_duration: 5,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Bland.ai API error: ${error}`);
  }

  return response.json();
}
