import path from "node:path";
import { snippetCategories } from "../lib/catalog";
import { useMDXComponents as getMDXComponents } from "../mdx-components";

// The snippet categories with their page, the number of pages in each and what they cover, read from
// content/ at build time (lib/catalog.js), so the table of the home page lists every snippet there is.
// Drawn with the table components of the MDX, as any table of the site.
export function CategoryTable() {
  const { table: Table, tr: Tr, th: Th, td: Td, a: A } = getMDXComponents();
  const categories = snippetCategories(path.join(process.cwd(), "content"));
  return (
    <Table>
      <thead>
        <Tr>
          <Th>Category</Th>
          <Th>Pages</Th>
          <Th>Description</Th>
        </Tr>
      </thead>
      <tbody>
        {categories.map((c) => (
          <Tr key={c.category}>
            <Td>
              <A href={c.url}>{c.title}</A>
            </Td>
            <Td>{c.count}</Td>
            <Td>{c.description}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
