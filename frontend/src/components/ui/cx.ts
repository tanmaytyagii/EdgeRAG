/** Class-name joiner. Lives in its own module so `Icon` can use it without
 *  importing the primitives barrel (and creating a cycle). */
export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}
