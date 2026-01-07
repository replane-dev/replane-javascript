export interface StartReplicationStreamBody {
  currentConfigs: ConfigDto[];
  requiredConfigs: string[];
}

export interface ConfigDto {
  name: string;
  overrides: Override[];
  value: unknown;
}

export type ReplicationStreamRecord =
  | {
      type: "config_change";
      config: ConfigDto;
    }
  | {
      type: "init";
      configs: ConfigDto[];
    };

interface PropertyCondition {
  operator:
    | "equals"
    | "in"
    | "not_in"
    | "less_than"
    | "less_than_or_equal"
    | "greater_than"
    | "greater_than_or_equal";
  property: string;
  value: unknown;
}

interface SegmentationCondition {
  operator: "segmentation";
  property: string;
  fromPercentage: number;
  toPercentage: number;
  seed: string;
}

interface AndCondition {
  operator: "and";
  conditions: Condition[];
}

interface OrCondition {
  operator: "or";
  conditions: Condition[];
}

interface NotCondition {
  operator: "not";
  condition: Condition;
}

export type Condition =
  | PropertyCondition
  | SegmentationCondition
  | AndCondition
  | OrCondition
  | NotCondition;

export interface Override {
  name: string;
  conditions: Condition[];
  value: unknown;
}
