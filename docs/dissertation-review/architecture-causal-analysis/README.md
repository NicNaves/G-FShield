# Evidência da campanha causal v9

Esta pasta preserva os produtos derivados da campanha pareada
`gfshield-architecture-causal-2026-v9`. A análise usa 60 execuções válidas
(30 pares, sementes 42--71) e compara a mesma sequência RF--VND--IWSSR em
execução distribuída e monolítica.

## Proveniência

- término da campanha: `2026-09-05T23:43:22.086427+00:00`;
- SHA-256 do estado analisado:
  `7c98cef249be408fb32b9baa2bbce38d6c94473d3b3fb9c17c099a1aefc7c686`;
- arquivo bruto completo no servidor:
  `/tmp/formal-v9-complete.tar.gz`;
- SHA-256 do arquivo bruto:
  `e0b4d096f33258aa8cfd49797ba18a1ee6be2a475caaac26ea2fd21489aeb3de`;
- 67 tentativas: 60 válidas e sete falhas distribuídas de inicialização;
- nenhum erro de checksum nos 60 manifestos válidos.

O arquivo bruto não é versionado nesta pasta por ter aproximadamente 38 MiB
compactado e 306 MiB extraído. Os CSVs e gráficos aqui presentes são derivados
por `experiments/architecture-causal-campaign/analyze_results.py`; o hash do
estado e as sementes de análise constam em `analysis-provenance.json`.

## Interpretação

A hipótese primária de menor tempo até F1 macro de validação 0,94 não foi
confirmada: a arquitetura distribuída foi mais lenta. Ela apresentou, porém,
maior vazão de candidatos e sobreposição construção--busca local em todos os
pares, além de maior redução dimensional mediana. Também consumiu mais CPU e
memória por candidato. Portanto, os resultados sustentam vantagens específicas
de paralelismo e vazão, não superioridade global.
