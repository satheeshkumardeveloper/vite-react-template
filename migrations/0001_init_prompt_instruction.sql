-- Create prompt_instruction table for storing instruction templates
CREATE TABLE IF NOT EXISTS prompt_instruction (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	value TEXT NOT NULL UNIQUE,
	label TEXT NOT NULL,
	prompt_instruction TEXT NOT NULL,
	description TEXT,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create index on value for faster lookups
CREATE INDEX IF NOT EXISTS idx_prompt_instruction_value ON prompt_instruction(value);

-- Insert default instructions
INSERT OR IGNORE INTO prompt_instruction (value, label, prompt_instruction, description) VALUES
('default', 'Default Instruction', 'Please analyze this image and provide a detailed description.', 'Basic image analysis with default parameters'),
('detailed', 'Detailed Analysis', 'Provide a comprehensive analysis of the image including all visible elements, colors, composition, and context.', 'In-depth image analysis'),
('category_wise', 'Category-wise Analysis', 'Analyze the image by breaking it down into categories: Objects, Colors, Composition, Context.', 'Structured category-based analysis'),
('exact_replica', 'Exact Replica Analysis', 'Describe this image in exact detail so someone could recreate it precisely without seeing it.', 'Precise replication-focused analysis'),
('dress_pose_brief', 'Dress Pose Brief', '${focus} Analyze the clothing and pose in this image briefly.', 'Quick analysis of dress and pose'),
('dress_pose_sweat_lovely', 'Dress Pose with Expression', '${focus} Describe the clothing, pose, and overall lovely appearance in detail.', 'Detailed dress, pose and appearance analysis'),
('dress_pose_high_quality', 'High Quality Dress Analysis', '${focus} Provide a high-quality, detailed analysis of the dress, pose, and styling.', 'Professional dress and styling analysis'),
('exact_visible_garment_coverage', 'Garment Coverage Analysis', '${focus} Analyze exactly what garments are visible and their coverage areas.', 'Detailed garment and coverage analysis'),
('full_analysis', 'Full Analysis', '${focus} Perform a comprehensive analysis including all aspects of the image: clothing, pose, colors, composition, context, and overall impression.', 'Complete multi-aspect analysis');
