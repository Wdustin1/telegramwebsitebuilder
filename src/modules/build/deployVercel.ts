import { env } from "../../config/env.js";

export async function deployToVercel(
  slug: string,
  html: string
): Promise<string> {
  const response = await fetch("https://api.vercel.com/v13/deployments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.VERCEL_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: slug,
      files: [
        {
          file: "index.html",
          data: Buffer.from(html).toString("base64"),
          encoding: "base64",
        },
      ],
      projectSettings: {
        framework: null,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Vercel deploy failed: ${error}`);
  }

  const data = await response.json();
  return `https://${data.url}`;
}
