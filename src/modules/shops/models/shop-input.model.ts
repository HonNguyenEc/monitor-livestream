import { ShopField } from '../constants/shop-fields.constants';

/** Candidate values of a shop's stored fields, before cleaning. */
export type ShopInput = Partial<Record<ShopField, unknown>>;
