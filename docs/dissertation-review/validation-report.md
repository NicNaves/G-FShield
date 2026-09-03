# Relatório de validação das dissertações

Data da validação: 2 de setembro de 2026.

## Compilação

As duas versões foram compiladas com MiKTeX pdfTeX 1.40.28, BibTeX 0.99e e `abntex2-alf`. O ciclo executado foi `pdflatex`, `bibtex`, `pdflatex`, `pdflatex`, seguido de recompilação após os ajustes tipográficos finais.

| Versão | Páginas | Tamanho | SHA-256 |
|---|---:|---:|---|
| Português | 91 | 17.353.798 bytes | `E2F7F93080F0F5B3A59ABC9EF6A80DE23E151D7DAD47270A1D76B74118B54279` |
| Inglês | 90 | 17.319.012 bytes | `EDE851D4C47EDBA89C40F2EC02624C01FD1393DF5F147BF1D8D0504007E0016A` |

Os logs finais não contêm erros LaTeX, referências/citações indefinidas, rótulos múltiplos nem caixas horizontais fora das margens. O aviso do MiKTeX sobre a verificação de atualizações não afeta o PDF produzido.

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
