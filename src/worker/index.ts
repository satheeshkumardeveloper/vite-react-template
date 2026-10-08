import { Hono } from "hono";
const app = new Hono<{ Bindings: Env }>();

app.get("/api/", (c) => c.json({ name: "Cloudflare Satheesh" }));

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

export default app;
