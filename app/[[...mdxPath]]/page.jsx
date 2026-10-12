import { generateStaticParamsFor, importPage } from "nextra/pages";
import { PageSchema } from "../../components/PageSchema";
import { markdownUrlOfRoute } from "../../lib/markdown-path.mjs";
import { useMDXComponents as getMDXComponents } from "../../mdx-components";

export const generateStaticParams = generateStaticParamsFor("mdxPath");

// Every page comes from generateStaticParams. A path outside them (a probe such as
// /.well-known/webmcp.json) is a 404 straight away, instead of reaching importPage, which throws
// and logs an error for a page that does not exist.
export const dynamicParams = false;

export async function generateMetadata(props) {
  const params = await props.params;
  const { metadata } = await importPage(params.mdxPath);
  // <link rel="alternate" type="text/markdown"> to the Markdown version of the page, for agents
  const markdown = markdownUrlOfRoute(params.mdxPath);
  if (!markdown) return metadata;
  return { ...metadata, alternates: { ...metadata.alternates, types: { ...metadata.alternates?.types, "text/markdown": markdown } } };
}

const Wrapper = getMDXComponents().wrapper;

export default async function Page(props) {
  const params = await props.params;
  const { default: MDXContent, toc, metadata, sourceCode } = await importPage(params.mdxPath);
  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      {/* Mounted by the page, not by the layout: a 404 would render it for a URL that does not exist */}
      <PageSchema />
      <MDXContent {...props} params={params} />
    </Wrapper>
  );
}
