export interface RecipeInput {
  readonly itemId: string;
  readonly quantity: number;
}

export interface Recipe {
  readonly id: string;
  readonly name: string;
  readonly inputs: readonly RecipeInput[];
  readonly outputItemId: string;
  readonly outputQuantity: number;
  /** 生產週期（遊戲 tick，Sprint 0 僅作占位） */
  readonly durationTicks: number;
}
