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

// GET image prompts - fetch all saved prompts
app.get("/api/image-prompts", async (c) => {
	try {
		const db = c.env.DB as D1Database;
		if (!db) {
			return c.json({ error: "D1 binding DB is missing in Worker environment." }, 500);
		}

		const { results } = await db
			.prepare("SELECT id, image_path, prompt, category, created_at FROM image_prompts ORDER BY created_at DESC, id DESC LIMIT 100")
			.all();
		return c.json(results || []);
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

export default app;
