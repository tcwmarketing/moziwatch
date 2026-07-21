import { verifyEstablishedOvertureCampgrounds } from "./overture-verification";

/** @deprecated Use the nationwide established-campground verifier. */
export async function verifySaskatchewanOvertureCampgrounds() {
  return verifyEstablishedOvertureCampgrounds({
    apply: true,
    country: "CA",
    region: "SK",
  });
}
