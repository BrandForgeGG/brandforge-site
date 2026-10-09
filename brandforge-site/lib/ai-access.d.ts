export type AccessStatus = 'requested' | 'granted' | 'denied' | null;
export declare function canGenerate(who: { isOwner: boolean; isAdmin: boolean; status: AccessStatus } | null | undefined): boolean;
export declare function accessState(who: { isOwner: boolean; isAdmin: boolean; status: AccessStatus } | null | undefined): 'allowed' | 'requested' | 'denied' | 'none';
