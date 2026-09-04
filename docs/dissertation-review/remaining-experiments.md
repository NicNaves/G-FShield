# Dados e experimentos ainda necessários

## Prioridade 1 — concluir a campanha causal pareada em execução

A auditoria do commit de origem das imagens da campanha anterior confirmou que a avaliação ativa já usa F1 macro multiclasse; `normalClass=0` pertence a uma rotina binária desabilitada. A limitação real é o confundimento entre arquitetura e algoritmo. A campanha `gfshield-architecture-causal-2026-v9`, iniciada em 4 de setembro de 2026, executa 30 sementes pareadas com RF--VND--IWSSR, J48, split, sementes, prazo de seleção e teto agregado de 6 CPUs/12 GiB idênticos. O braço distribuído usa três consumidores para permitir sobreposição entre construção e busca local; o monólito conserva o fluxo sequencial. Os resultados devem permanecer pendentes até a conclusão válida dos 60 braços e a aplicação do desfecho primário e da salvaguarda de qualidade pré-especificados.

## Prioridade 2 — convergência e comportamento *anytime*

A instrumentação causal agora avalia cada candidato intermediário na validação comum e persiste `(campaign_id, run_id, request_id, seed, arm, elapsed_monotonic, subset, validation_macro_f1)`. Ela calcula tempo censurado até F1 macro 0,93, 0,94, 0,945 e 0,95, além da área normalizada sob a curva da melhor solução. O teste é consultado uma única vez para a solução selecionada. Falta concluir a campanha e analisar os 30 pares; pilotos não substituem essa evidência.

## Prioridade 3 — scale-out e custo

Executar campanha separada variando réplicas/workers (por exemplo 1, 2, 4 e 8), mantendo explícitos CPU/RAM totais e concorrência. Medir tempo, candidatos ponta a ponta, soluções válidas, throughput, CPU-h, GiB-h e eficiência por unidade de recurso. A campanha atual controla orçamento agregado, mas não mede curva de escalabilidade.

## Prioridade 4 — observabilidade e recuperação

Medir objetivamente: completude de eventos, duplicação/perda, latência evento→persistência→dashboard, overhead com e sem instrumentação, reconstrução integral por `run_id`, reinício de consumidor, recuperação de broker e reprocessamento idempotente. A dissertação documenta a capacidade projetada, não esses resultados.

## Prioridade 5 — validade externa e poder estatístico

Repetir a campanha em pelo menos um segundo corpus de CPS/ICS, com novo split estratificado e manifesto; avaliar outro classificador além de J48; aumentar o número de sementes a partir de análise de poder; e, se possível, replicar em outro host. Essas extensões testam generalização para dados, classificadores e hardware diferentes.

## Artefato editorial pendente

Depositar o vídeo demonstrativo e o pacote reprodutível em repositório persistente, com versão/tag e preferencialmente DOI. O caminho local já foi removido, mas o link web atual não constitui preservação arquivística.
