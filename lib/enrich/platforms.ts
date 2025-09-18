export type PlatformCompany = { source: "alibaba"|"madeInChina"|"indiamart"; name: string; products?: string[]; emails?: string[]; phones?: string[]; website?: string; location?: string; };
export async function findPlatformsByName(name: string, enabled: {alibaba:boolean;madeInChina:boolean;indiamart:boolean}, timeoutMs: number): Promise<PlatformCompany[]> {
  return []; // TODO
}
