"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupHiddenImages = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
exports.cleanupHiddenImages = functions.https.onRequest({ timeoutSeconds: 540, memory: '1GiB' }, async (req, res) => {
    try {
        let ticketsFixed = 0;
        let logsFixed = 0;
        const tenantsSnap = await db.collection('tenants').get();
        const ticketPromises = [];
        for (const tenantDoc of tenantsSnap.docs) {
            const tenantId = tenantDoc.id;
            const ticketsSnap = await db.collection('tenants').doc(tenantId).collection('tickets').get();
            for (const ticketDoc of ticketsSnap.docs) {
                const data = ticketDoc.data();
                if (data.imageId && typeof data.imageId === 'string' && data.imageId.startsWith('hidden-')) {
                    ticketPromises.push(ticketDoc.ref.update({
                        imageId: null,
                        updatedAt: new Date().toISOString()
                    }));
                    ticketsFixed++;
                }
            }
        }
        await Promise.all(ticketPromises);
        const logsSnap = await db.collection('audit_logs')
            .where('action', '==', 'TICKET_CREATED')
            .get();
        const logPromises = [];
        for (const logDoc of logsSnap.docs) {
            const data = logDoc.data();
            const details = data.details || {};
            const imageId = details.imageId || details.ticketId;
            if (imageId && typeof imageId === 'string' && imageId.startsWith('hidden-')) {
                logPromises.push(logDoc.ref.update({
                    'details.imageId': null,
                    'details.hasImage': false
                }));
                logsFixed++;
            }
        }
        await Promise.all(logPromises);
        res.status(200).send({
            success: true,
            message: `Cleanup completed. Fixed ${ticketsFixed} tickets and ${logsFixed} audit logs.`,
            ticketsFixed,
            logsFixed
        });
    }
    catch (error) {
        console.error('Cleanup failed:', error);
        res.status(500).send({ success: false, error: error.message });
    }
});
//# sourceMappingURL=cleanup.js.map