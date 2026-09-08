const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export async function checkBackendHealth(): Promise<{ status: string } | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
