import { withNextPath } from "@/lib/auth-redirect";

const DEFAULT_WORDPRESS_LOGIN_URL =
  "https://vintagefork.ca/wp-admin/admin-post.php?action=vintage_fork_tea_lab_login";

export function sharedWordPressLoginUrl(next: string) {
  const endpoint =
    process.env.NEXT_PUBLIC_WORDPRESS_ACCOUNT_LOGIN_URL?.trim()
    || DEFAULT_WORDPRESS_LOGIN_URL;
  return withNextPath(endpoint, next);
}
