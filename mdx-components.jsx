import { useMDXComponents as getDocsMDXComponents } from 'nextra-theme-docs'

const docsComponents = getDocsMDXComponents()

export function useMDXComponents(components) {
  return {
    ...docsComponents,
    ...components
    // Aquí puedes añadir o sobrescribir componentes MDX globales personalizados
    // Ejemplo:
    // MyCustomComponent: MyCustomComponent,
  }
}
