export type ProjectEvent =
  | {
      type: "config_created";
      configName: string;
      overrides: RenderedOverride[];
      version: number;
      value: unknown;
    }
  | {
      type: "config_updated";
      configName: string;
      overrides: RenderedOverride[];
      version: number;
      value: unknown;
    }
  | {
      type: "config_deleted";
      configName: string;
      version: number;
    }
  | {
      type: "config_list";
      configs: Array<{
        name: string;
        overrides: RenderedOverride[];
        version: number;
        value: unknown;
      }>;
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
  conditions: RenderedCondition[];
}

interface OrCondition {
  operator: "or";
  conditions: RenderedCondition[];
}

interface NotCondition {
  operator: "not";
  condition: RenderedCondition;
}

export type RenderedCondition =
  | PropertyCondition
  | SegmentationCondition
  | AndCondition
  | OrCondition
  | NotCondition;

export interface RenderedOverride {
  name: string;
  conditions: RenderedCondition[];
  value: unknown;
}
