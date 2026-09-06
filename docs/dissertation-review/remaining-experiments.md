# Dados e experimentos ainda necessários

## Campanha causal concluída

A campanha `gfshield-architecture-causal-2026-v9` terminou com 30 sementes pareadas e 60 execuções válidas da mesma sequência RF--VND--IWSSR. Ela confirmou maior vazão de candidatos, sobreposição construção--busca local e redução dimensional no distribuído, mas rejeitou a hipótese de menor tempo até F1 macro 0,94 e mostrou maior custo de CPU e memória por candidato. A salvaguarda de não inferioridade de qualidade falhou por margem estreita. Os resultados, a proveniência e os gráficos estão em `architecture-causal-analysis/` e já foram integrados às dissertações.

## Prioridade 1 — rendimento confirmatório de soluções de alta qualidade

A análise pós-hoc da v9 sugeriu uma hipótese diferente: a maior vazão distribuída pode produzir mais subconjuntos distintos com F1 macro de validação $\geq 0{,}945$ dentro do mesmo prazo, ainda que o primeiro limiar seja atingido mais tarde. O protocolo `gfshield-architecture-quality-yield-2026-v10` congelou esse desfecho antes de usar as sementes independentes 72--101. A instrumentação persiste o subconjunto e tempo monotônico de cada candidato nos dois braços. A campanha deve ser concluída e analisada antes que essa hipótese possa entrar como resultado confirmatório.

## Prioridade 2 — scale-out e custo

Executar campanha separada variando réplicas/workers (por exemplo 1, 2, 4 e 8), mantendo explícitos CPU/RAM totais e concorrência. Medir tempo, candidatos ponta a ponta, soluções válidas, throughput, CPU-h, GiB-h e eficiência por unidade de recurso. A campanha atual controla orçamento agregado, mas não mede curva de escalabilidade.

## Prioridade 3 — observabilidade e recuperação

Medir objetivamente: completude de eventos, duplicação/perda, latência evento→persistência→dashboard, overhead com e sem instrumentação, reconstrução integral por `run_id`, reinício de consumidor, recuperação de broker e reprocessamento idempotente. A dissertação documenta a capacidade projetada, não esses resultados.

## Prioridade 4 — validade externa e poder estatístico

Repetir a campanha em pelo menos um segundo corpus de CPS/ICS, com novo split estratificado e manifesto; avaliar outro classificador além de J48; aumentar o número de sementes a partir de análise de poder; e, se possível, replicar em outro host. Essas extensões testam generalização para dados, classificadores e hardware diferentes.

## Artefato editorial pendente

Depositar o vídeo demonstrativo e o pacote reprodutível em repositório persistente, com versão/tag e preferencialmente DOI. O caminho local já foi removido, mas o link web atual não constitui preservação arquivística.
