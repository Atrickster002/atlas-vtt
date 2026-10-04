import type { TokenStatblockLinkService } from './TokenStatblockLinkService';

type LinkFollower = Pick<TokenStatblockLinkService, 'findAssetByAnyPath' | 'getTokenLinkedToStatblock' | 'arePathsEquivalent' | 'linkTokenToStatblock'>;

/**
 * A statblock note's image changed (its Portrait in the statblock pane, Properties, a sync tool).
 * The link follows only to an image that is itself a token asset. A cleared image, or one that
 * names other art (a full-body illustration), leaves the link as it is: unlinking would clear the
 * statblock values of every token with the linked art, on the open map and in every map file.
 *
 * Returns the image of the token asset the note names, which the note's linked tokens show, or
 * null when it names none.
 */
export async function followStatblockImage(service: LinkFollower, statblockPath: string, image: string | null): Promise<string | null> {
  if (!image) return null;
  const asset = await service.findAssetByAnyPath(image);
  if (!asset) return null;
  const linked = await service.getTokenLinkedToStatblock(statblockPath);
  if (linked && service.arePathsEquivalent(linked, asset.imagePath)) return asset.imagePath;
  const relinked = await service.linkTokenToStatblock(asset.imagePath, statblockPath, {
    showConfirmation: false,
    // The note names the token already.
    updateStatblockAvatar: false,
    fromNote: true,
  });
  return relinked ? asset.imagePath : null;
}
