export interface ItemStack {
  readonly itemId: string;
  readonly quantity: number;
}

export interface Inventory {
  readonly ownerId: string;
  readonly stacks: readonly ItemStack[];
}
