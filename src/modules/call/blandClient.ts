import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

const log = logger.child({ module: "blandClient" });

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
  log.info({ phoneNumber: request.phoneNumber }, "bland_call_request");

  const response = await fetch("https://api.bland.ai/v1/calls", {
    method: "POST",
    headers: {
      Authorization: env.BLAND_API_KEY!,
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
    log.error({ status: response.status, error }, "bland_call_failed");
    throw new Error(`Bland.ai API error: ${error}`);
  }

  const data: CallResponse = await response.json();

  log.info({ callId: data.call_id, status: data.status }, "bland_call_created");

  return data;
}
