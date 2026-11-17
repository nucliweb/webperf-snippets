import path from "node:path";
import Link from "next/link";
import { categoryCatalog } from "../lib/catalog";

// A title with `code` in it, as the page writes it: "Get your `<head>` in order"
function Title({ text }) {
  return text.split(/(`[^`]+`)/).map((part, i) => (part.startsWith("`") ? <code key={i}>{part.slice(1, -1)}</code> : part));
}

// The pages of a category of snippets, each with its title and description, read from content/ at build
// time (lib/catalog.js): the order of the sidebar, and every page that is in it
export function Catalog({ category }) {
  const { pages } = categoryCatalog(path.join(process.cwd(), "content"), category);
  return (
    <ul className="wp-catalog">
      {pages.map((page) => (
        <li key={page.slug}>
          <Link href={page.url} className="wp-catalog-title">
            <Title text={page.title} />
          </Link>
          <p>{page.description}</p>
        </li>
      ))}
    </ul>
  );
}
