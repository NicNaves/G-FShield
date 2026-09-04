# Relatório de validação das dissertações

Data da validação editorial mais recente: 3 de setembro de 2026.

## Compilação

As duas versões foram compiladas com MiKTeX pdfTeX 1.40.28, BibTeX 0.99e e `abntex2-alf`. O ciclo executado foi `pdflatex`, `bibtex`, `pdflatex`, `pdflatex`, seguido de recompilação após os ajustes tipográficos finais.

| Versão | Páginas | Tamanho | SHA-256 |
|---|---:|---:|---|
| Português | 91 | 17.354.578 bytes | `500520406603CF543233E88DB750CE9AE5FDA2E781F032CD4D4915DAC8842C08` |
| Inglês | 90 | 17.319.613 bytes | `CAD35EBE88DD684FFDDE13604B51B84F4AA05DEFA32B6270801CE1500F624A42` |

Os logs finais não contêm erros LaTeX, referências/citações indefinidas, rótulos múltiplos nem caixas horizontais fora das margens. O aviso do MiKTeX sobre a verificação de atualizações não afeta o PDF produzido.

A revisão de 3 de setembro corrigiu a caracterização da função objetivo da campanha: o commit de origem das imagens usa F1 macro multiclasse e mantém a rotina binária com `normalClass=0` desabilitada. As limitações em Avaliação e Conclusão agora se concentram na diferença de operadores e na ausência de uma trajetória temporal monolítica equivalente na campanha anterior. As páginas afetadas foram renderizadas novamente e não apresentaram corte, sobreposição ou perda de legibilidade.

## Consistência e bibliografia

- As duas versões usam o mesmo conjunto de 37 chaves efetivamente citadas.
- Os dois arquivos `gfshield-references.bib` são byte a byte idênticos.
- Todos os registros citados possuem os campos obrigatórios para seu tipo.
- Todos os DOIs declarados foram resolvidos e comparados com título e ano no registro Crossref.
- A referência retraída de Li e Sun foi removida das duas bases e não possui citação remanescente.
- Os números da campanha foram derivados exclusivamente de `docs/dissertation-review/experiment-10d-analysis/`.

## Inspeção visual

Todas as 91 páginas em português e 90 páginas em inglês foram renderizadas em folhas de contato. As páginas do Capítulo 5 também foram renderizadas em resolução ampliada. Foram inspecionados: capa e elementos pré-textuais, sumário/listas, pseudocódigos, tabelas, diagramas arquiteturais, tabela final, cinco novos gráficos, referências e apêndices.

Os diagramas largos e a tabela principal usam páginas em paisagem; as imagens preservam proporção com `keepaspectratio`. Não foram observados cortes, sobreposição, conteúdo fora das margens ou rótulos ilegíveis nos novos gráficos. Os arquivos de imagem e PDF originais não foram editados; os ajustes de escala foram feitos no LaTeX.

## Verificações da análise

- 216 execuções válidas: 27 braços × 8 sementes.
- 228 tentativas totais e 12 tentativas inválidas preservadas como `NO_COMPLETE_SOLUTION`.
- Checksums dos artefatos da campanha verificados antes da análise.
- Três casos de teste automatizados do analisador, com sete asserções, aprovados por `unittest`.
- Comparações estatísticas usam execução/semente como unidade experimental, teste pareado de permutação, correção de Holm e tamanho de efeito.

## Backup anterior às mudanças

Arquivo: `backups/dissertacoes-pre-analise-20260902-144734.zip`  
Tamanho: 105.370.481 bytes  
SHA-256: `4E9E7E2AF0AE1FDA78366A84E811D26F2B51EE7C25742314FA3A9DF261541A7A`
