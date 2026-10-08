-- Create clipboard table
CREATE TABLE IF NOT EXISTS clipboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NULL,
    content TEXT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "order" INTEGER
);

-- Create index on order for faster sorting
CREATE INDEX IF NOT EXISTS idx_clipboard_order ON clipboard("order" DESC, id DESC);
