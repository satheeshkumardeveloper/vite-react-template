import { Hono } from "hono";
const app = new Hono<{ Bindings: Env }>();

app.get("/api/", (c) => c.json({ name: "Cloudflare Satheesh" }));

app.post("/api/ai-chat", async (c) => {
	try {
		const body = await c.req.json();
		const selectedModel = String(body?.model || "gemini-2.5-flash").trim();
		const allowedModels = [
			"gemini-3.8-flash",
			"gemini-3.7-flash",
			"gemini-3.6-flash",
			"gemini-3.5-flash",
			"gemini-3.5-flash-lite",
			"gemini-3.1-pro-preview",
			"gemini-3.1-pro-preview-customtools",
			"gemini-3.1-flash-lite-preview",
			"gemini-3-pro-preview",
			"gemini-3-flash-preview",
			"gemini-2.5-pro",
			"gemini-2.5-flash",
			"gemini-2.5-flash-lite",
			"@cf/zai-org/glm-4.7-flash",
			"@cf/meta/llama-3.2-1b-instruct",
			"@cf/meta/llama-3.2-3b-instruct",
			"@cf/google/gemma-7b-it-lora",
			"@cf/mistralai/mistral-small-3.1-24b-instruct",
			"@cf/nvidia/nemotron-3-120b-a12b",
			"@cf/openai/gpt-oss-120b",
			"@cf/cloudflare/clef-flash",
		];
		const rawMessages = Array.isArray(body?.messages) ? (body.messages as Array<{ role?: unknown; content?: unknown }>) : [];

		if (!allowedModels.includes(selectedModel)) {
			return c.json({ error: "Unsupported model selected" }, 400);
		}

		const messages = rawMessages
			.map((message) => ({
				role: String(message?.role || "").trim(),
				content: String(message?.content || "").trim(),
			}))
			.filter((message) => message.role && message.content);

		if (!messages.length) {
			return c.json({ error: "messages are required" }, 400);
		}

		if (selectedModel.startsWith("gemini-")) {
			const apiKey = c.env.GEMINI_API_KEY_PRIMARY;
			if (!apiKey) {
				return c.json({ error: "Missing GEMINI_API_KEY_PRIMARY in Worker environment." }, 500);
			}

			const systemText = messages
				.filter((message) => message.role === "system")
				.map((message) => message.content)
				.join("\n\n")
				.trim();

			const geminiMessages = messages
				.filter((message) => message.role !== "system")
				.map((message) => ({
					role: message.role === "assistant" ? "model" : "user",
					parts: [{ text: message.content }],
				}));

			if (!geminiMessages.length) {
				return c.json({ error: "messages are required" }, 400);
			}

			const upstream = await fetch(
				`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent?key=${apiKey}`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
						contents: geminiMessages,
						generationConfig: {
							maxOutputTokens: 2048,
						},
					}),
				},
			);

			const rawText = await upstream.text();
			let output: any = null;

			try {
				output = JSON.parse(rawText);
			} catch {
				return c.json({ error: "Invalid Gemini response", raw: rawText }, 502);
			}

			if (!upstream.ok || output?.error) {
				return new Response(
					JSON.stringify({ error: output?.error?.message || "Google Gemini request failed", upstream: output }),
					{
						status: upstream.status || 502,
						headers: { "content-type": "application/json;charset=UTF-8" },
					},
				);
			}

			const assistantText = String(output?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("") || "").trim();
			const tokenUsage = output?.usageMetadata || null;

			return c.json({
				response: assistantText,
				model: output?.model || selectedModel,
				usage: tokenUsage,
				id: output?.responseId || output?.id || null,
			});
		}

		const env = c.env as unknown as Record<string, string | undefined>;
		const accountId = env.CF_ACCOUNT_ID;
		const aiToken = env.CF_AI_API_TOKEN;

		if (!accountId || !aiToken) {
			return c.json({ error: "Missing Cloudflare AI credentials in Worker environment." }, 500);
		}

		const upstream = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${aiToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: selectedModel,
				messages,
				stream: false,
				max_tokens: 100000,
			}),
		});

		const rawText = await upstream.text();
		let output: any = null;

		try {
			output = JSON.parse(rawText);
		} catch {
			return c.json({ error: "Invalid upstream response", raw: rawText }, 502);
		}

		if (!upstream.ok || (output as { success?: boolean } | null)?.success === false) {
			return new Response(JSON.stringify({ error: "Cloudflare AI request failed", upstream: output }), {
				status: upstream.status || 502,
				headers: { "content-type": "application/json;charset=UTF-8" },
			});
		}

		const assistantText = output?.choices?.[0]?.message?.content || output?.response || "";

		return c.json({
			response: assistantText,
			model: output?.model || selectedModel,
			usage: output?.usage || null,
			id: output?.id || null,
		});
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

app.post("/api/image-prompt-generate", async (c) => {
	try {
		const body = await c.req.json();
		const selectedKey = String(body?.key || "primary").toLowerCase() as "primary" | "secondary" | "tertiary";
		const requestBody = body?.requestBody || body;
		const model = String(body?.model || "gemini-3.6-flash");

		const apiKeyMap = {
			primary: c.env.GEMINI_API_KEY_PRIMARY,
			secondary: c.env.GEMINI_API_KEY_SECONDARY,
			tertiary: c.env.GEMINI_API_KEY_TERTIARY,
		};

		const apiKey = apiKeyMap[selectedKey] || apiKeyMap.primary;

		if (!apiKey) {
			return c.json({ error: "Missing Gemini API key in Worker environment." }, 500);
		}

		const requestBodyWithTokenLimit = {
			...requestBody,
			generationConfig: {
				...(requestBody?.generationConfig || {}),
				maxOutputTokens: 1024,
			},
		};

		const upstream = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requestBodyWithTokenLimit),
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

app.post("/api/image-generate", async (c) => {
	try {
		const body = await c.req.json();
		const prompt = String(body?.prompt || "").trim();
		const model = String(body?.model || "gemini-2.5-flash-image").trim();

		if (!prompt) {
			return c.json({ error: "prompt is required" }, 400);
		}

		const apiKey = c.env.GEMINI_API_KEY_PRIMARY;
		if (!apiKey) {
			return c.json({ error: "Missing GEMINI_API_KEY_PRIMARY in Worker environment." }, 500);
		}

		const upstream = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					contents: [{
						role: "user",
						parts: [{ text: prompt }],
					}],
					generationConfig: {
						responseModalities: ["TEXT", "IMAGE"],
					},
				}),
			},
		);

		const rawText = await upstream.text();
		let output: any = null;

		try {
			output = JSON.parse(rawText);
		} catch {
			return c.json({ error: "Invalid Gemini image response", raw: rawText }, 502);
		}

		if (!upstream.ok || output?.error) {
			return new Response(
				JSON.stringify({ error: output?.error?.message || "Google Gemini image request failed", upstream: output }),
				{
					status: upstream.status || 502,
					headers: { "content-type": "application/json;charset=UTF-8" },
				},
			);
		}

		const parts = output?.candidates?.[0]?.content?.parts || [];
		const inlineImagePart = parts.find((part: { inlineData?: { data?: string; mimeType?: string }; inline_data?: { data?: string; mime_type?: string } }) =>
			Boolean(part?.inlineData?.data || part?.inline_data?.data)
		);
		const base64Image = String(inlineImagePart?.inlineData?.data || inlineImagePart?.inline_data?.data || "").trim();
		const mimeType = String(inlineImagePart?.inlineData?.mimeType || inlineImagePart?.inline_data?.mime_type || "image/png").trim() || "image/png";

		if (!base64Image) {
			return c.json({ error: "No image was returned by Gemini.", raw: output }, 502);
		}

		return c.json({
			imageDataUrl: `data:${mimeType};base64,${base64Image}`,
			model,
			raw: output,
		});
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

// GET image prompts - fetch all saved prompts
app.get("/api/image-prompts", async (c) => {
	try {
		const db = c.env.DB as D1Database;
		if (!db) {
			return c.json({ error: "D1 binding DB is missing in Worker environment." }, 500);
		}

		const category = (c.req.query("category") || "").trim();
		const query = category
			? db.prepare(
					"SELECT id, image_path, prompt, category, created_at FROM image_prompts WHERE category = ? ORDER BY created_at DESC, id DESC LIMIT 100",
			  ).bind(category)
			: db.prepare("SELECT id, image_path, prompt, category, created_at FROM image_prompts ORDER BY created_at DESC, id DESC LIMIT 100");

		const { results } = await query.all();
		return c.json(results || []);
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

// GET categories - fetch distinct category values only
app.get("/api/image-prompts/categories", async (c) => {
	try {
		const db = c.env.DB as D1Database;
		if (!db) {
			return c.json({ error: "D1 binding DB is missing in Worker environment." }, 500);
		}

		const { results } = await db
			.prepare(
				"SELECT DISTINCT category FROM image_prompts WHERE category IS NOT NULL AND TRIM(category) <> '' ORDER BY category ASC",
			)
			.all();

		const categories = (results || [])
			.map((row) => (row as { category?: string | null }).category)
			.filter((category): category is string => Boolean(category));

		return c.json(categories);
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

// POST image prompts - save new prompt with images
app.post("/api/image-prompts", async (c) => {
	try {
		const db = c.env.DB as D1Database;
		const r2 = c.env.IMAGES as R2Bucket;

		if (!db || !r2) {
			return c.json(
				{ error: "D1 binding DB or R2 binding IMAGES is missing in Worker environment." },
				500,
			);
		}

		const form = await c.req.formData();
		const prompt = form.get("prompt")?.toString().trim();
		const category = form.get("category")?.toString().trim() || null;
		const images = form.getAll("images").filter((item) => item instanceof File);

		if (!prompt) {
			return c.json({ error: "prompt is required" }, 400);
		}
		if (!images.length) {
			return c.json({ error: "At least one image is required" }, 400);
		}

		const imagePaths = await Promise.all(
			images.map(async (image) => {
				const file = image as File;
				const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "image";
				const key = `IMAGE-PROMPT/${crypto.randomUUID()}-${filename}`;
				await r2.put(key, file.stream(), {
					httpMetadata: { contentType: file.type || "application/octet-stream" },
				});
				return key;
			}),
		);

		const created = await db
			.prepare(
				"INSERT INTO image_prompts (image_path, prompt, category) VALUES (?, ?, ?) RETURNING id, image_path, prompt, category, created_at",
			)
			.bind(JSON.stringify(imagePaths), prompt, category)
			.first();

		return c.json(created, 201);
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

// DELETE image prompt - remove prompt and associated images
app.delete("/api/image-prompts/:id", async (c) => {
	try {
		const db = c.env.DB as D1Database;
		const r2 = c.env.IMAGES as R2Bucket;
		const id = c.req.param("id");

		if (!db || !r2) {
			return c.json(
				{ error: "D1 binding DB or R2 binding IMAGES is missing in Worker environment." },
				500,
			);
		}

		const recordId = Number(id);
		const existing = await db.prepare("SELECT id, image_path FROM image_prompts WHERE id = ?").bind(recordId).first();

		if (!existing) {
			return c.json({ error: "Saved prompt not found" }, 404);
		}

		let imagePaths: string[] = [];
		try {
			const parsedPaths = JSON.parse((existing as Record<string, unknown>).image_path as string || "[]");
			imagePaths = Array.isArray(parsedPaths) ? parsedPaths : [];
		} catch {
			const imagePath = (existing as Record<string, string>).image_path;
			if (imagePath) imagePaths = [imagePath];
		}

		await Promise.all(imagePaths.map((imagePath) => r2.delete(imagePath)));
		await db.prepare("DELETE FROM image_prompts WHERE id = ?").bind(recordId).run();

		return c.json({ success: true, id: recordId });
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

// GET image from R2 bucket
app.get("/api/image-prompts/image", async (c) => {
	try {
		const r2 = c.env.IMAGES as R2Bucket;
		if (!r2) {
			return c.json({ error: "R2 binding IMAGES is missing in Worker environment." }, 500);
		}

		const key = c.req.query("key");
		if (!key || !key.startsWith("IMAGE-PROMPT/")) {
			return c.json({ error: "Invalid image key" }, 400);
		}

		const object = await r2.get(key);
		if (!object) {
			return c.text("Not found", 404);
		}

		return new Response(object.body, {
			headers: {
				"content-type": object.httpMetadata?.contentType || "application/octet-stream",
				"cache-control": "public, max-age=31536000, immutable",
			},
		});
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

app.post("/api/image-prompt-vision", async (c) => {
	try {
		const body = await c.req.json();
		const promptText = String(body?.promptText || "").trim();
		const imageList = Array.isArray(body?.images) ? body.images as Array<{ dataUrl?: string; url?: string }> : [];
		const selectedModel = String(body?.model || "@cf/meta/llama-3.2-11b-vision-instruct").trim();
		const allowedModels = [
			"@cf/meta/llama-4-scout-17b-16e-instruct",
			"@cf/meta/llama-3.2-11b-vision-instruct",
			"@cf/mistralai/mistral-small-3.1-24b-instruct",
		];

		if (!allowedModels.includes(selectedModel)) {
			return c.json({ error: "Unsupported model selected" }, 400);
		}
		if (!promptText) {
			return c.json({ error: "promptText is required" }, 400);
		}
		if (!imageList.length) {
			return c.json({ error: "At least one image is required" }, 400);
		}

		const messageContent = [
			{ type: "text", text: promptText },
			...imageList
				.map((image: { dataUrl?: string; url?: string } | string) => {
					const dataUrl = typeof image === "string" ? image : image?.dataUrl || image?.url || null;
					if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
						return null;
					}
					return { type: "image_url", image_url: { url: dataUrl } };
				})
				.filter(Boolean),
		];

		if (messageContent.length === 1) {
			return c.json({ error: "Valid image data is required" }, 400);
		}

		const env = c.env as unknown as Record<string, string | undefined>;
		const accountId = env.CF_ACCOUNT_ID;
		const aiToken = env.CF_AI_API_TOKEN;
		if (!accountId || !aiToken) {
			return c.json({ error: "Missing Cloudflare AI credentials in Worker environment." }, 500);
		}

		const upstream = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${selectedModel}`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${aiToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					messages: [
						{
							role: "user",
							content: messageContent,
						},
					],
					max_tokens: 2024,
				}),
			},
		);

		const rawText = await upstream.text();
		let data: any;
		try {
			data = JSON.parse(rawText);
		} catch {
			return c.json({ error: "Invalid upstream response", raw: rawText }, 502);
		}

		if (!upstream.ok || data?.success === false) {
			return new Response(
				JSON.stringify({
					error: data?.errors?.[0]?.message || data?.error || "Cloudflare vision request failed",
					raw: data,
				}),
				{
					status: upstream.status || 502,
					headers: { "content-type": "application/json;charset=UTF-8" },
				},
			);
		}

		const reply = String(data?.result?.response || "").trim();
		const totalTokens = data?.result?.usage?.total_tokens ?? data?.result?.usage?.totalTokens ?? null;
		if (!reply) {
			return c.json({ error: "No prompt returned by Cloudflare", raw: data }, 502);
		}

		return c.json({ reply, totalTokens, raw: data });
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

// GET all prompt instructions - fetch from database
app.get("/api/prompt-instruction", async (c) => {
	try {
		const db = c.env.DB as D1Database;
		if (!db) {
			return c.json({ error: "D1 binding DB is missing in Worker environment." }, 500);
		}

		const { results } = await db
			.prepare(
				"SELECT id, value, label, prompt_instruction, description FROM prompt_instruction ORDER BY id ASC",
			)
			.all();

		return c.json(results || []);
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

// POST create new prompt instruction
app.post("/api/prompt-instruction", async (c) => {
	try {
		const db = c.env.DB as D1Database;
		if (!db) {
			return c.json({ error: "D1 binding DB is missing in Worker environment." }, 500);
		}

		const body = await c.req.json();
		const { label, prompt_instruction, description } = body as Record<string, unknown>;
		const value = body?.value;

		if (!value || !label || !prompt_instruction) {
			return c.json({ error: "value, label, and prompt_instruction are required" }, 400);
		}

		const created = await db
			.prepare(
				"INSERT INTO prompt_instruction (value, label, prompt_instruction, description) VALUES (?, ?, ?, ?) RETURNING id, value, label, prompt_instruction, description",
			)
			.bind(String(value).trim(), String(label).trim(), String(prompt_instruction).trim(), description ? String(description).trim() : null)
			.first();

		return c.json(created, 201);
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		if (errorMsg.includes("UNIQUE constraint failed")) {
			return c.json({ error: "An instruction with this value already exists" }, 409);
		}
		return c.json({ error: errorMsg }, 500);
	}
});

// PUT update prompt instruction
app.put("/api/prompt-instruction/:id", async (c) => {
	try {
		const db = c.env.DB as D1Database;
		if (!db) {
			return c.json({ error: "D1 binding DB is missing in Worker environment." }, 500);
		}

		const id = Number(c.req.param("id"));
		const body = await c.req.json();
		const { label, prompt_instruction, description } = body as Record<string, unknown>;

		if (!label || !prompt_instruction) {
			return c.json({ error: "label and prompt_instruction are required" }, 400);
		}

		const existing = await db.prepare("SELECT id FROM prompt_instruction WHERE id = ?").bind(id).first();

		if (!existing) {
			return c.json({ error: "Prompt instruction not found" }, 404);
		}

		const updated = await db
			.prepare(
				"UPDATE prompt_instruction SET label = ?, prompt_instruction = ?, description = ? WHERE id = ? RETURNING id, value, label, prompt_instruction, description",
			)
			.bind(String(label).trim(), String(prompt_instruction).trim(), description ? String(description).trim() : null, id)
			.first();

		return c.json(updated);
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

// DELETE prompt instruction
app.delete("/api/prompt-instruction/:id", async (c) => {
	try {
		const db = c.env.DB as D1Database;
		if (!db) {
			return c.json({ error: "D1 binding DB is missing in Worker environment." }, 500);
		}

		const id = Number(c.req.param("id"));

		const existing = await db.prepare("SELECT id FROM prompt_instruction WHERE id = ?").bind(id).first();

		if (!existing) {
			return c.json({ error: "Prompt instruction not found" }, 404);
		}

		await db.prepare("DELETE FROM prompt_instruction WHERE id = ?").bind(id).run();

		return c.json({ success: true, id });
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

// Clipboard CRUD API Endpoints

// GET all clipboard entries
app.get("/api/clipboard", async (c) => {
	try {
		const db = c.env.DB as D1Database;
		if (!db) {
			return c.json({ error: "D1 binding DB is missing in Worker environment." }, 500);
		}

		const { results } = await db
			.prepare(
				'SELECT id, title, content, updated_at, "order" FROM clipboard ORDER BY "order" DESC, id DESC',
			)
			.all();

		return c.json(results || []);
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

// POST create new clipboard entry
app.post("/api/clipboard", async (c) => {
	try {
		const db = c.env.DB as D1Database;
		if (!db) {
			return c.json({ error: "D1 binding DB is missing in Worker environment." }, 500);
		}

		const body = await c.req.json();
		const title = body?.title || null;
		const content = body?.content || null;

		// Get the current max order
		const maxOrderResult = await db
			.prepare('SELECT MAX(COALESCE("order", 0)) as max_order FROM clipboard')
			.first();
		const maxOrder = (maxOrderResult as Record<string, number>)?.max_order ?? 0;
		const newOrder = maxOrder + 1;

		const created = await db
			.prepare(
				'INSERT INTO clipboard (title, content, updated_at, "order") VALUES (?, ?, CURRENT_TIMESTAMP, ?) RETURNING id, title, content, updated_at, "order"',
			)
			.bind(title, content, newOrder)
			.first();

		return c.json(created, 201);
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

// PUT update clipboard entry
app.put("/api/clipboard/:id", async (c) => {
	try {
		const db = c.env.DB as D1Database;
		if (!db) {
			return c.json({ error: "D1 binding DB is missing in Worker environment." }, 500);
		}

		const id = Number(c.req.param("id"));
		const body = await c.req.json();
		const title = body?.title || null;
		const content = body?.content || null;
		const order = body?.order !== undefined ? Number(body.order) : null;

		const existing = await db.prepare("SELECT id FROM clipboard WHERE id = ?").bind(id).first();

		if (!existing) {
			return c.json({ error: "Clipboard entry not found" }, 404);
		}

		// If order is provided, update order; otherwise just update content
		let updated;
		if (order !== null) {
			updated = await db
				.prepare(
					'UPDATE clipboard SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP, "order" = ? WHERE id = ? RETURNING id, title, content, updated_at, "order"',
				)
				.bind(title, content, order, id)
				.first();
		} else {
			updated = await db
				.prepare(
					'UPDATE clipboard SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING id, title, content, updated_at, "order"',
				)
				.bind(title, content, id)
				.first();
		}

		return c.json(updated);
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

// DELETE clipboard entry
app.delete("/api/clipboard/:id", async (c) => {
	try {
		const db = c.env.DB as D1Database;
		if (!db) {
			return c.json({ error: "D1 binding DB is missing in Worker environment." }, 500);
		}

		const id = Number(c.req.param("id"));

		const existing = await db.prepare("SELECT id FROM clipboard WHERE id = ?").bind(id).first();

		if (!existing) {
			return c.json({ error: "Clipboard entry not found" }, 404);
		}

		await db.prepare("DELETE FROM clipboard WHERE id = ?").bind(id).run();

		return c.json({ success: true, id });
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

// GET folder structure only
app.get("/api/files/folders", async (c) => {
	try {
		const r2 = c.env.IMAGES as R2Bucket;
		if (!r2) {
			return c.json({ error: "R2 binding IMAGES is missing in Worker environment." }, 500);
		}

		const folderSet = new Set<string>();
		let cursor: string | undefined;
		let truncated = true;

		// Handle pagination - loop until all objects are retrieved
		while (truncated) {
			const listed = await r2.list({ cursor });
			
			// Extract unique folder paths from all file keys
			for (const obj of listed.objects || []) {
				const key = obj.key;
				if (key && key.includes("/") && !key.startsWith("thumbs/")) {
					const folderPath = key.substring(0, key.lastIndexOf("/"));
					if (folderPath && !folderPath.startsWith("thumbs")) folderSet.add(folderPath);
				}
			}

			truncated = (listed as any).truncated || false;
			cursor = (listed as any).cursor;
		}

		const folders = Array.from(folderSet).sort((a, b) => a.localeCompare(b));
		return c.json({ folders });
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

// GET files in a specific folder
app.get("/api/files/by-folder", async (c) => {
	try {
		const r2 = c.env.IMAGES as R2Bucket;
		if (!r2) {
			return c.json({ error: "R2 binding IMAGES is missing in Worker environment." }, 500);
		}

		const folder = (c.req.query("folder") || "").trim();
		const objects: Array<{
			Key: string;
			LastModified: Date | undefined;
			ETag: string | null;
			Size: number | undefined;
			StorageClass: string;
		}> = [];

		let cursor: string | undefined;
		let truncated = true;

		// Handle pagination - loop until all objects are retrieved
		while (truncated) {
			const listed = await r2.list({ cursor });
			
			const filtered = (listed.objects || [])
				.filter((obj) => {
					const key = obj.key;
					if (!key) return false;
					if (folder === "(root)") {
						// Root folder: files without any "/" in the key
						return !key.includes("/");
					}
					// Specific folder: files whose path starts with the folder name
					return key.startsWith(`${folder}/`) && !key.substring(`${folder}/`.length).includes("/");
				})
				.map((obj) => ({
					Key: obj.key,
					LastModified: obj.uploaded,
					ETag: obj.httpEtag || obj.etag || null,
					Size: obj.size,
					StorageClass: obj.httpMetadata?.contentType ? "STANDARD" : "STANDARD",
				}));

			objects.push(...filtered);
			truncated = (listed as any).truncated || false;
			cursor = (listed as any).cursor;
		}

		return c.json(objects);
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

app.get("/api/files", async (c) => {
	try {
		const r2 = c.env.IMAGES as R2Bucket;
		if (!r2) {
			return c.json({ error: "R2 binding IMAGES is missing in Worker environment." }, 500);
		}

		const prefix = (c.req.query("prefix") || "").trim();
		const objects: Array<{
			Key: string;
			LastModified: Date | undefined;
			ETag: string | null;
			Size: number | undefined;
			StorageClass: string;
		}> = [];

		let cursor: string | undefined;
		let truncated = true;

		// Handle pagination - loop until all objects are retrieved
		while (truncated) {
			const listed = await r2.list({ prefix: prefix || undefined, cursor });
			
			const mapped = (listed.objects || []).map((obj) => ({
				Key: obj.key,
				LastModified: obj.uploaded,
				ETag: obj.httpEtag || obj.etag || null,
				Size: obj.size,
				StorageClass: obj.httpMetadata?.contentType ? "STANDARD" : "STANDARD",
			}));

			objects.push(...mapped);
			truncated = (listed as any).truncated || false;
			cursor = (listed as any).cursor;
		}

		return c.json(objects);
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

app.post("/api/files/upload", async (c) => {
	try {
		const formData = await c.req.formData();
		const prefix = (formData.get("prefix")?.toString() || "").trim();
		const files = formData.getAll("files").filter((item): item is File => item instanceof File);

		// Try to get S3 credentials from formData
		const endpoint = (formData.get("endpoint")?.toString() || "").trim();
		const bucket = (formData.get("bucket")?.toString() || "").trim();
		const region = (formData.get("region")?.toString() || "").trim();
		const accessKey = (formData.get("accessKey")?.toString() || "").trim();
		const secretKey = (formData.get("secretKey")?.toString() || "").trim();

		if (!files.length) {
			return c.json({ error: "At least one file is required." }, 400);
		}

		const uploadedKeys: string[] = [];

		// If credentials provided, use S3 API via fetch with AWS SigV4; otherwise fall back to R2 binding
		if (endpoint && bucket && region && accessKey && secretKey) {
			// Use S3-compatible upload via fetch with AWS Signature Version 4
			try {
				// Helper function to calculate SHA256
				const calculateSHA256 = async (data: Uint8Array): Promise<string> => {
					const hashBuffer = await crypto.subtle.digest("SHA-256", data);
					const hashArray = Array.from(new Uint8Array(hashBuffer));
					return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
				};

				// Helper function to sign AWS request
				const signAWSRequest = async (
					method: string,
					hostName: string,
					canonicalURI: string,
					payloadHash: string,
					accessKeyId: string,
					secretAccessKey: string,
					awsRegion: string,
				) => {
					const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
					const datestamp = amzDate.slice(0, 8);

					const canonicalHeaders = `host:${hostName}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
					const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
					const canonicalRequest = `${method}\n${canonicalURI}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

					const canonicalRequestHash = await calculateSHA256(new TextEncoder().encode(canonicalRequest));
					const credentialScope = `${datestamp}/${awsRegion}/s3/aws4_request`;
					const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

					// Calculate AWS SigV4 signature
					const hmacSHA256 = async (key: Uint8Array, message: string): Promise<Uint8Array> => {
						const importedKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
						const signature = await crypto.subtle.sign("HMAC", importedKey, new TextEncoder().encode(message));
						return new Uint8Array(signature);
					};

					const kSecret = new TextEncoder().encode(`AWS4${secretAccessKey}`);
					const kDate = await hmacSHA256(kSecret, datestamp);
					const kRegion = await hmacSHA256(kDate, awsRegion);
					const kService = await hmacSHA256(kRegion, "s3");
					const kSigningKey = await hmacSHA256(kService, "aws4_request");
					const signature = await hmacSHA256(kSigningKey, stringToSign);

					const signatureHex = Array.from(signature)
						.map((b) => b.toString(16).padStart(2, "0"))
						.join("");

					const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signatureHex}`;

					return {
						authorization: authorizationHeader,
						amzDate,
					};
				};

				const s3Endpoint = endpoint.startsWith("http") ? endpoint : `https://${endpoint}`;
				const hostName = new URL(s3Endpoint).hostname;
				const s3BaseUrl = `${s3Endpoint}/${bucket}`;

				for (const file of files) {
					const relativePath = String((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name || "upload.bin")
						.replace(/\\/g, "/")
						.replace(/^\/+/, "")
						.trim();
					const normalizedPath = relativePath === "" ? "upload.bin" : relativePath;
					const key = prefix ? `${prefix.replace(/^\/+|\/+$/g, "")}/${normalizedPath.replace(/^\/+/, "")}` : normalizedPath.replace(/^\/+/, "");

					const buffer = await file.arrayBuffer();
					const bufferArray = new Uint8Array(buffer);
					const payloadHash = await calculateSHA256(bufferArray);

					const canonicalURI = `/${bucket}/${key}`;
					const signData = await signAWSRequest("PUT", hostName, canonicalURI, payloadHash, accessKey, secretKey, region);

					const url = `${s3BaseUrl}/${key}`;
					const uploadResponse = await fetch(url, {
						method: "PUT",
						headers: {
							"Content-Type": file.type || "application/octet-stream",
							"x-amz-content-sha256": payloadHash,
							"x-amz-date": signData.amzDate,
							"Authorization": signData.authorization,
						},
						body: bufferArray,
					});

					if (!uploadResponse.ok) {
						const errorText = await uploadResponse.text();
						throw new Error(`S3 upload failed for ${key}: ${uploadResponse.status} - ${errorText}`);
					}

					uploadedKeys.push(key);
				}
			} catch (sdkError) {
				throw new Error(`S3 upload failed: ${sdkError instanceof Error ? sdkError.message : String(sdkError)}`);
			}
		} else {
			// Fall back to R2 binding if no credentials provided
			const r2 = c.env.IMAGES as R2Bucket;
			if (!r2) {
				return c.json({ error: "R2 binding IMAGES is missing and no S3 credentials provided." }, 500);
			}

			for (const file of files) {
				const relativePath = String((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name || "upload.bin")
					.replace(/\\/g, "/")
					.replace(/^\/+/, "")
					.trim();
				const normalizedPath = relativePath === "" ? "upload.bin" : relativePath;
				const key = prefix ? `${prefix.replace(/^\/+|\/+$/g, "")}/${normalizedPath.replace(/^\/+/, "")}` : normalizedPath.replace(/^\/+/, "");
				await r2.put(key, file.stream(), {
					httpMetadata: {
						contentType: file.type || "application/octet-stream",
					},
				});
				uploadedKeys.push(key);
			}
		}

		return c.json({ success: true, uploaded: uploadedKeys });
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

app.delete("/api/files", async (c) => {
	try {
		const r2 = c.env.IMAGES as R2Bucket;
		if (!r2) {
			return c.json({ error: "R2 binding IMAGES is missing in Worker environment." }, 500);
		}

		const body = await c.req.json().catch(() => ({}));
		const keys = Array.isArray(body?.keys) ? (body.keys as unknown[]).map((key: unknown) => String(key)) : []; 
		if (!keys.length) {
			return c.json({ error: "At least one key is required." }, 400);
		}

		await Promise.all(keys.map((key: string) => r2.delete(key)));
		return c.json({ success: true, deleted: keys.length });
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

app.get("/api/files/download", async (c) => {
	try {
		const r2 = c.env.IMAGES as R2Bucket;
		if (!r2) {
			return c.json({ error: "R2 binding IMAGES is missing in Worker environment." }, 500);
		}

		const key = (c.req.query("key") || "").trim();
		if (!key) {
			return c.json({ error: "Missing file key." }, 400);
		}

		const object = await r2.get(key);
		if (!object) {
			return c.text("Not found", 404);
		}

		const download = c.req.query("download") === "1";
		const fileName = key.split("/").pop() || "download";
		return new Response(object.body, {
			headers: {
				"content-type": object.httpMetadata?.contentType || "application/octet-stream",
				"content-disposition": download ? `attachment; filename="${fileName}"` : `inline; filename="${fileName}"`,
				"cache-control": "no-store",
			},
		});
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

// New endpoint to create saved chat history rows
app.post("/api/saved-history", async (c) => {
	try {
		const db = c.env.DB as D1Database;
		if (!db) {
			return c.json({ error: "D1 binding DB is missing in Worker environment." }, 500);
		}

		const body = await c.req.json();
		const title = String(body?.title || "Untitled chat").trim();
		const content = String(body?.content || "").trim();

		if (!content) {
			return c.json({ error: "content is required" }, 400);
		}

		const inserted = await db
			.prepare(
				"INSERT INTO saved_history (title, content) VALUES (?, ?) RETURNING id, title, content, created_at",
			)
			.bind(title || "Untitled chat", content)
			.first();

		return c.json(inserted, 201);
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

app.get("/api/saved-history", async (c) => {
	try {
		const db = c.env.DB as D1Database;
		if (!db) {
			return c.json({ error: "D1 binding DB is missing in Worker environment." }, 500);
		}

		const rows = await db
			.prepare("SELECT id, title, content, created_at FROM saved_history ORDER BY created_at DESC")
			.all();

		return c.json({ results: rows.results || [] }, 200);
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

app.delete("/api/saved-history/:id", async (c) => {
	try {
		const db = c.env.DB as D1Database;
		if (!db) {
			return c.json({ error: "D1 binding DB is missing in Worker environment." }, 500);
		}

		const id = Number(c.req.param("id"));
		if (!Number.isFinite(id) || id <= 0) {
			return c.json({ error: "Invalid history id." }, 400);
		}

		const existing = await db.prepare("SELECT id FROM saved_history WHERE id = ?").bind(id).first();
		if (!existing) {
			return c.json({ error: "Saved history item not found" }, 404);
		}

		await db.prepare("DELETE FROM saved_history WHERE id = ?").bind(id).run();
		return c.json({ success: true, id }, 200);
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
	}
});

export default app;
