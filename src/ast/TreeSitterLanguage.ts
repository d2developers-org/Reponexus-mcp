import { SupportedLanguage, SymbolType } from './types';

export interface LanguageDefinition {
  language: SupportedLanguage;
  extensions: string[];
  grammarPackage: string;
  declarations: Record<string, SymbolType>;
  imports: string[];
  calls: string[];
}

export const languageDefinitions: LanguageDefinition[] = [
  {
    language: 'javascript',
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    grammarPackage: 'tree-sitter-javascript',
    declarations: {
      class_declaration: 'class',
      function_declaration: 'function',
      generator_function_declaration: 'function',
      method_definition: 'method',
      variable_declarator: 'variable',
    },
    imports: ['import_statement'],
    calls: ['call_expression', 'new_expression'],
  },
  {
    language: 'typescript',
    extensions: ['.ts', '.tsx', '.mts', '.cts'],
    grammarPackage: 'tree-sitter-typescript',
    declarations: {
      class_declaration: 'class',
      abstract_class_declaration: 'class',
      interface_declaration: 'interface',
      function_declaration: 'function',
      generator_function_declaration: 'function',
      method_definition: 'method',
      variable_declarator: 'variable',
      type_alias_declaration: 'type',
      enum_declaration: 'enum',
    },
    imports: ['import_statement'],
    calls: ['call_expression', 'new_expression'],
  },
  {
    language: 'python',
    extensions: ['.py', '.pyi'],
    grammarPackage: 'tree-sitter-python',
    declarations: {
      class_definition: 'class',
      function_definition: 'function',
    },
    imports: ['import_statement', 'import_from_statement'],
    calls: ['call'],
  },
  {
    language: 'java',
    extensions: ['.java'],
    grammarPackage: 'tree-sitter-java',
    declarations: {
      class_declaration: 'class',
      interface_declaration: 'interface',
      enum_declaration: 'enum',
      record_declaration: 'type',
      method_declaration: 'method',
      constructor_declaration: 'constructor',
      variable_declarator: 'variable',
    },
    imports: ['import_declaration'],
    calls: ['method_invocation', 'object_creation_expression'],
  },
  {
    language: 'cpp',
    extensions: ['.cc', '.cpp', '.cxx', '.hh', '.hpp', '.hxx', '.h'],
    grammarPackage: 'tree-sitter-cpp',
    declarations: {
      class_specifier: 'class',
      struct_specifier: 'struct',
      function_definition: 'function',
      field_declarator: 'variable',
    },
    imports: ['preproc_include'],
    calls: ['call_expression'],
  },
  {
    language: 'go',
    extensions: ['.go'],
    grammarPackage: 'tree-sitter-go',
    declarations: {
      type_spec: 'type',
      function_declaration: 'function',
      method_declaration: 'method',
      var_spec: 'variable',
      const_spec: 'variable',
    },
    imports: ['import_declaration'],
    calls: ['call_expression'],
  },
  {
    language: 'rust',
    extensions: ['.rs'],
    grammarPackage: 'tree-sitter-rust',
    declarations: {
      struct_item: 'struct',
      enum_item: 'enum',
      trait_item: 'trait',
      function_item: 'function',
      type_item: 'type',
      const_item: 'variable',
      static_item: 'variable',
    },
    imports: ['use_declaration'],
    calls: ['call_expression', 'macro_invocation'],
  },
];

const definitionByExtension = new Map<string, LanguageDefinition>(
  languageDefinitions.flatMap((definition) =>
    definition.extensions.map((extension) => [extension, definition] as const),
  ),
);

export function languageForPath(filePath: string): LanguageDefinition | undefined {
  const extension = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return definitionByExtension.get(extension);
}
