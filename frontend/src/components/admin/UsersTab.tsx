import React from 'react';
import { UserManagement } from './UserManagement';
import { VendorManagement } from './VendorManagement';
import { CsvUploadPanel } from './CsvUploadPanel';


interface UsersTabProps {
  tenantId: string;
  callerUid: string;
  callerName: string;
  categories?: string[];
}

export const UsersTab: React.FC<UsersTabProps> = ({
  tenantId,
  callerUid,
  callerName,
  categories = []
}) => {
  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <div className="flex flex-col gap-6">
        <UserManagement
          tenantId={tenantId}
          callerUid={callerUid}
          callerName={callerName}
        />
        <VendorManagement
          tenantId={tenantId}
          callerUid={callerUid}
          callerName={callerName}
          availableCategories={categories}
        />
        <CsvUploadPanel
          tenantId={tenantId}
          callerName={callerName}
        />
      </div>


    </div>
  );
};
