import { supabase } from "./supabaseClient";

export async function uploadImage(file: File): Promise<string | null> {
  if (!supabase) return null;
  const client = supabase;
  const filePath = `${crypto.randomUUID()}-${file.name}`;
  const { error } = await client.storage.from("images").upload(filePath, file);
  if (error) {
    console.error("Failed to upload image:", error);
    return null;
  }
  const { data } = client.storage.from("images").getPublicUrl(filePath);
  return data?.publicUrl ?? null;
}
