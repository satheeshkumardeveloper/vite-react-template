-- Create pose_prompt table
CREATE TABLE IF NOT EXISTS pose_prompt (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NULL,
    content TEXT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "order" INTEGER
);

-- Create index on order for faster sorting
CREATE INDEX IF NOT EXISTS idx_pose_prompt_order ON pose_prompt("order" DESC, id DESC);
