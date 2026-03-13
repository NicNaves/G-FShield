package br.com.graspfs.producer.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.*;

import java.util.ArrayList;
@Builder
@Setter
@Getter
@AllArgsConstructor
public class DataSolution {

    @JsonProperty("seedId")
    private  Long seedId;// id da mensagem

    @JsonProperty("solutionFeatures")
    private  ArrayList<Integer> solutionFeatures;// []

    @JsonProperty("rclfeatures")
    private  ArrayList<Integer> rclfeatures;// []

    @JsonProperty("neighborhood")
    private String neighborhood;// vnd

    @JsonProperty("iterationNeighborhood")
    private Integer iterationNeighborhood; //01

    @JsonProperty("classfier")
    private String classfier;// J48

    @JsonProperty("f1Score")
    private Float f1Score;// 98%

    @JsonProperty("rclAlgorithm")
    private String rclAlgorithm;

    @JsonProperty("cpuUsage")
    private Float cpuUsage;

    @JsonProperty("memoryUsage")
    private Float memoryUsage;

    @JsonProperty("memoryUsagePercent")
    private Float memoryUsagePercent;

    @JsonProperty("localSearch")
    private String localSearch; // BF

    @JsonProperty("runnigTime")
    private Long runnigTime;// tempo de execução

    @JsonProperty("iterationLocalSearch")
    private Integer iterationLocalSearch; //01

    public DataSolution() {
    }

}
