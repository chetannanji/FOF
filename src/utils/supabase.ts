import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY is not defined in environment variables. File uploads will fail.");
}

export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
      },
    })
  : null;

/**
 * Uploads a file to Supabase Storage and returns the public URL.
 * @param file The Express.Multer.File object (from memory storage)
 * @param pathInBucket The path inside the 'sports' bucket (e.g. 'rules/rules-123.pdf')
 * @returns The public URL of the uploaded file
 */
export async function uploadToSupabase(file: Express.Multer.File, pathInBucket: string): Promise<string> {
  if (!supabase) {
    throw new Error("Supabase client is not initialized. Please check your environment variables.");
  }

  const { error } = await supabase.storage
    .from("sports")
    .upload(pathInBucket, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload to Supabase Storage: ${error.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from("sports")
    .getPublicUrl(pathInBucket);

  if (!publicUrlData || !publicUrlData.publicUrl) {
    throw new Error("Failed to get public URL for uploaded file.");
  }

  return publicUrlData.publicUrl;
}
