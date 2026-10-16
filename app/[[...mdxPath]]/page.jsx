import { generateStaticParamsFor, importPage } from "nextra/pages";
import { PageSchema } from "../../components/PageSchema";
import { join } from "node:path";
import { BASE_URL, markdownUrlOfRoute, pageOfRoute } from "../../lib/markdown-path.mjs";
import { pageMetadata } from "../../lib/page-metadata";
import { readPageInfo } from "../../lib/page-info";
import { useMDXComponents as getMDXComponents } from "../../mdx-components";

export const generateStaticParams = generateStaticParamsFor("mdxPath");

// Every page comes from generateStaticParams. A path outside them (a probe such as
// /.well-known/webmcp.json) is a 404 straight away, instead of reaching importPage, which throws
// and logs an error for a page that does not exist.
export const dynamicParams = false;

// What the page says about itself: title, description and snippets (lib/page-info.js)
const infoOf = (mdxPath) => {
  const page = pageOfRoute(mdxPath);
  return page && readPageInfo(join(process.cwd(), "content"), page);
};
const urlOf = (mdxPath = []) => `${BASE_URL}/${mdxPath.join("/")}`;

export async function generateMetadata(props) {
  const params = await props.params;
  const { metadata } = await importPage(params.mdxPath);
  const info = infoOf(params.mdxPath);
  if (!info) return metadata;
  const markdown = markdownUrlOfRoute(params.mdxPath);
  const page = pageMetadata({ url: urlOf(params.mdxPath), title: info.title, description: info.description });
  return {
    ...metadata,
    ...page,
    // <link rel="alternate" type="text/markdown"> to the Markdown version of the page, for agents
    alternates: {
      ...metadata.alternates,
      ...page.alternates,
      types: { ...metadata.alternates?.types, "text/markdown": markdown },
    },
  };
}

const Wrapper = getMDXComponents().wrapper;

export default async function Page(props) {
  const params = await props.params;
  const { default: MDXContent, toc, metadata, sourceCode } = await importPage(params.mdxPath);
  const info = infoOf(params.mdxPath);
  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      {/* Mounted by the page, not by the layout: a 404 would render it for a URL that does not exist */}
      {info && <PageSchema pathname={`/${(params.mdxPath ?? []).join("/")}`} page={info} />}
      <MDXContent {...props} params={params} />
    </Wrapper>
  );
}
