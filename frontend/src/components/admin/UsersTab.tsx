import React from 'react';
import { UserManagement } from './UserManagement';
import { VendorManagement } from './VendorManagement';
import { CsvUploadPanel } from './CsvUploadPanel';


interface UsersTabProps {
  tenantId: string;
  callerUid: string;
  callerName: string;
  categories?: string[];
  tenantType?: 'building' | 'municipality';
}

export const UsersTab: React.FC<UsersTabProps> = ({
  tenantId,
  callerUid,
  callerName,
  categories = [],
  tenantType = 'building'
}) => {
  return (
    <div className="flex flex-col gap-6 max-w-5xl w-full mx-auto">
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
          tenantType={tenantType}
        />
      </div>


    </div>
  );
};
