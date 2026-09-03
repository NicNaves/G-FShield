# Dados e experimentos ainda necessários

## Prioridade 1 — campanha confirmatória com objetivo comum

Corrigir no G-FShield o uso de `normalClass=0`: no ARFF preservado, o índice 0 é `grayhole` e `normal` é o índice 1. A implementação deve localizar a classe pelo rótulo e usar a mesma função objetivo multiclasse em G-FShield, Monólito 1 e Monólito 2. Depois, repetir a matriz de 27 braços × pelo menos oito sementes sob o mesmo protocolo, imagens versionadas, split imutável e teto agregado de 8 CPUs/16 GiB. Sem essa campanha, os resultados finais são descritivamente comparáveis, mas diferenças não podem ser atribuídas apenas à arquitetura.

## Prioridade 2 — convergência e comportamento *anytime*

Avaliar cada candidato intermediário no conjunto de validação com o avaliador comum, nunca no teste, e persistir `(run_id, seed, arm, elapsed_monotonic, subset, validation_macro_f1)`. Isso permite calcular por execução o tempo até F1 macro 0,95 e a curva da melhor solução disponível ao longo do tempo. O teste continua sendo consultado apenas uma vez para a solução selecionada.

## Prioridade 3 — scale-out e custo

Executar campanha separada variando réplicas/workers (por exemplo 1, 2, 4 e 8), mantendo explícitos CPU/RAM totais e concorrência. Medir tempo, candidatos ponta a ponta, soluções válidas, throughput, CPU-h, GiB-h e eficiência por unidade de recurso. A campanha atual controla orçamento agregado, mas não mede curva de escalabilidade.

## Prioridade 4 — observabilidade e recuperação

Medir objetivamente: completude de eventos, duplicação/perda, latência evento→persistência→dashboard, overhead com e sem instrumentação, reconstrução integral por `run_id`, reinício de consumidor, recuperação de broker e reprocessamento idempotente. A dissertação documenta a capacidade projetada, não esses resultados.

## Prioridade 5 — validade externa e poder estatístico

Repetir a campanha em pelo menos um segundo corpus de CPS/ICS, com novo split estratificado e manifesto; avaliar outro classificador além de J48; aumentar o número de sementes a partir de análise de poder; e, se possível, replicar em outro host. Essas extensões testam generalização para dados, classificadores e hardware diferentes.

## Artefato editorial pendente

Depositar o vídeo demonstrativo e o pacote reprodutível em repositório persistente, com versão/tag e preferencialmente DOI. O caminho local já foi removido, mas o link web atual não constitui preservação arquivística.
