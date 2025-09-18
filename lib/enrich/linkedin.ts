export type LinkedInCompany = { name: string; website?: string; size?: string; industry?: string; location?: string };
export async function findLinkedInCompanyByName(name: string, timeoutMs: number): Promise<LinkedInCompany | null> {
  return null; // TODO
}
