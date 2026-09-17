# Dados e experimentos ainda necessários

## Campanha causal concluída

A campanha `gfshield-architecture-causal-2026-v9` terminou com 30 sementes pareadas e 60 execuções válidas da mesma sequência RF--VND--IWSSR. Ela confirmou maior vazão de candidatos, sobreposição construção--busca local e redução dimensional no distribuído, mas rejeitou a hipótese de menor tempo até F1 macro 0,94 e mostrou maior custo de CPU e memória por candidato. A salvaguarda de não inferioridade de qualidade falhou por margem estreita. Os resultados, a proveniência e os gráficos estão em `architecture-causal-analysis/` e já foram integrados às dissertações.

## Campanha confirmatória de rendimento concluída

A campanha gfshield-architecture-quality-yield-2026-v10 terminou com as
60 execuções válidas planejadas, ou 30 pares independentes nas sementes
72--101, sem repetição. Sob o mesmo prazo de 2.700 s e teto de seis CPUs/12 GiB,
o G-FShield apresentou diferença média pareada de +0,933 subconjunto distinto
com F1 macro de validação >= 0,945 por execução (IC95% 0,233--1,667;
p unilateral=0,010135). A salvaguarda de qualidade no teste e a confirmação do
mecanismo de sobreposição foram satisfeitas. Os resultados e a proveniência
estão em architecture-quality-yield-analysis/ e foram integrados às
dissertações.

## Prioridade 1 — ablação do pipeline e curva de escala

Executar campanha separada com 1, 2, 3 e 4 consumidores e, em outra dimensão,
variar o teto agregado de CPU. Manter algoritmo, dados, sementes, prazo e RAM
fixos. Medir rendimento de subconjuntos qualificados, vazão, latência,
CPU-h/GiB-h por subconjunto qualificado e atraso Kafka. Isso separa o efeito do
pipeline da alocação de recursos e testa se a vantagem cresce com capacidade.
## Prioridade 2 — concorrência sustentada e custo

Executar campanha separada variando réplicas/workers (por exemplo 1, 2, 4 e 8), mantendo explícitos CPU/RAM totais e concorrência. Medir tempo, candidatos ponta a ponta, soluções válidas, throughput, CPU-h, GiB-h e eficiência por unidade de recurso. A campanha atual controla orçamento agregado, mas não mede curva de escalabilidade.

## Prioridade 3 — observabilidade e recuperação

Medir objetivamente: completude de eventos, duplicação/perda, latência evento→persistência→dashboard, overhead com e sem instrumentação, reconstrução integral por `run_id`, reinício de consumidor, recuperação de broker e reprocessamento idempotente. A dissertação documenta a capacidade projetada, não esses resultados.

## Prioridade 4 — validade externa e poder estatístico

Repetir a campanha em pelo menos um segundo corpus de CPS/ICS, com novo split estratificado e manifesto; avaliar outro classificador além de J48; aumentar o número de sementes a partir de análise de poder; e, se possível, replicar em outro host. Essas extensões testam generalização para dados, classificadores e hardware diferentes.

## Artefato editorial pendente

Depositar o vídeo demonstrativo e o pacote reprodutível em repositório persistente, com versão/tag e preferencialmente DOI. O caminho local já foi removido, mas o link web atual não constitui preservação arquivística.
