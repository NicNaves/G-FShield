# Plano de comparação externa com IWSHAP

## Decisão editorial

A comparação entre G-FShield e IWSHAP deve entrar nas dissertações em português
e inglês somente depois da conclusão e auditoria dos experimentos. Uma alegação
de resultado superior será feita apenas para métricas em que G-FShield apresente
vantagem sob protocolo comparável e com incerteza adequadamente reportada.

Resultados desfavoráveis ou mistos não serão ocultados: nesse caso, o texto
apresentará o resultado como compromisso entre qualidade, tempo, redução
dimensional e consumo de recursos, sem alegação geral de superioridade.

## Estratos que não podem ser misturados

1. Resultado publicado e logs históricos do IWSHAP: contexto de trabalho
   relacionado, com o protocolo e a escala informados pelos autores.
2. Reprodução do artefato original: código no commit
   `fb0d3093c12421d08ab3fb595d20c29ba2442e65`, divisão 80/20 com
   `random_state=42` e parâmetros originais do XGBoost. Como os mesmos 20% são
   reutilizados durante a seleção e no resultado reportado, este estrato não é
   um teste imparcial.
3. Comparação controlada: mesmos dados, partições, classificador final e métricas,
   com subconjuntos congelados e conjunto de teste consultado uma única vez.
4. Comparação arquitetural: 30 sementes pareadas entre G-FShield distribuído e
   monólito com algoritmo, orçamento computacional e condição de parada comuns.

## Critérios para escrever “melhor”

- Qualidade: macro-F1 como métrica primária, acompanhada de F1, precisão e
  revocação da classe positiva; informar estimativa, intervalo de confiança e
  teste pareado quando houver unidade experimental pareável.
- Velocidade: tempo até um limiar de validação definido a partir dos baselines do
  próprio cenário, além do tempo ponta a ponta. Execuções que não atingirem o
  limiar serão tratadas como censuradas.
- Processamento: CPU-segundos e memória de pico, sempre distinguindo maior vazão
  de menor custo computacional.
- Redução: número e percentual de características removidas, condicionado à
  qualidade mantida no teste intocado.
- Arquitetura: sobreposição temporal entre construção e busca local e vazão por
  etapa. Contagens de construção e IWSSR devem permanecer separadas.

Não será usada a expressão “G-FShield é superior ao IWSHAP” com base apenas nos
valores históricos. Se a vantagem ocorrer somente no protocolo controlado, a
conclusão deverá limitar explicitamente a alegação a esse dataset, classificador,
host e orçamento experimental.

## Tabela planejada para Avaliação

A tabela final deverá apresentar, por cenário: método, estrato de evidência,
protocolo de partição, classificador, número de registros, características
selecionadas, redução dimensional, macro-F1, F1/precisão/revocação positiva,
tempo até o limiar, tempo ponta a ponta, CPU-segundos e RAM de pico. Células não
comparáveis serão marcadas como não aplicáveis em vez de receberem diferenças ou
razões artificiais.

## Estado

- Ablação do filtro em lote: concluída e aprovada nos dois cenários.
- Reprodução original IWSHAP: concluída nos cenários de suspensão e fabricação.
- Campanha formal G-FShield: 63 de 120 células válidas foram concluídas antes de
  uma reinicialização do servidor em 10 de setembro de 2026. Os 63 manifestos e
  todos os arquivos enumerados por eles foram revalidados por SHA-256, sem erro.
  A pasta da 64ª célula, interrompida antes de produzir `final-result.json`, foi
  preservada como `attempt-1-interrupted-reboot-20260910`, e a campanha foi
  retomada em 12 de setembro sem repetir as células válidas.
- Pós-processamento: o analisador pareado e a reavaliação XGBoost comum estão
  versionados e enfileirados para iniciar somente após `CAMPAIGN_COMPLETED`.
- Integração PT/EN, compilação e inspeção visual: aguardam resultados finais.
