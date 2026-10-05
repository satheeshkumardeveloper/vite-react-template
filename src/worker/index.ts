import { Hono } from "hono";
const app = new Hono<{ Bindings: Env }>();

app.get("/api/", (c) => c.json({ name: "Cloudflare Satheesh" }));

app.post("/api/image-prompt-generate", async (c) => {
	try {
		const body = await c.req.json();
		const selectedKey = String(body?.key || "primary").toLowerCase() as "primary" | "secondary" | "tertiary";
		const requestBody = body?.requestBody || body;
		const model = String(body?.model || "gemini-3.6-flash");
		const env = c.env as Record<string, string | undefined>;

		const apiKeyMap = {
			primary: env.GEMINI_API_KEY_PRIMARY,
			secondary: env.GEMINI_API_KEY_SECONDARY,
			tertiary: env.GEMINI_API_KEY_TERTIARY,
		};

		const apiKey = apiKeyMap[selectedKey] || apiKeyMap.primary;

		if (!apiKey) {
			return c.json({ error: "Missing Gemini API key in Worker environment." }, 500);
		}

		const upstream = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requestBody),
			},
		);

		const rawText = await upstream.text();
		return new Response(rawText, {
			status: upstream.status,
			headers: {
				"content-type": upstream.headers.get("content-type") || "application/json;charset=UTF-8",
			},
		});
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

export default app;
