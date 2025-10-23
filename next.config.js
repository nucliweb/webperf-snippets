import nextra from "nextra";

export default nextra({});

export async function redirects() {
  return [
    {
      source: "/Loading/Find-Above-The-Fold-Lazy-Loades-Images",
      destination: "/Loading/Find-Above-The-Fold-Lazy-Loaded-Images",
      permanent: true,
    },
  ];
}
