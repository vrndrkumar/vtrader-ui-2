import { axiosPrivate } from './axios'

// ── User tag (from GET /tags) ─────────────────────────────────────────────────

export interface UserTag {
  id: number
  userId: number
  name: string
  metadata: { colorCode: string }
  createdAt: string
  updatedAt: string
}

/** Fetch all tags created by the authenticated user. */
export async function getAllTags(): Promise<UserTag[]> {
  const res = await axiosPrivate.get<{ status: boolean; data: UserTag[] }>('/tags')
  return res.data?.data ?? []
}

/** Replace the tag list on a trade. Pass all tag names that should be active.
 *  The server creates any tag that doesn't exist yet.
 *
 *  PUT /trades/:tradeId/tags  { tags: ["TAG_A", "TAG_B"] }
 */
export async function updateTradeTags(tradeId: string, tagNames: string[]): Promise<void> {
  await axiosPrivate.put(`/trades/${encodeURIComponent(tradeId)}/tags`, { tags: tagNames })
}
