import React from 'react';
import { UserManagement } from './UserManagement';
import { CsvUploadPanel } from './CsvUploadPanel';


interface UsersTabProps {
  tenantId: string;
  callerUid: string;
  callerName: string;
}

export const UsersTab: React.FC<UsersTabProps> = ({
  tenantId,
  callerUid,
  callerName,
}) => {
  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <div className="flex flex-col gap-6">
        <UserManagement
          tenantId={tenantId}
          callerUid={callerUid}
          callerName={callerName}
        />
        <CsvUploadPanel
          tenantId={tenantId}
          callerName={callerName}
        />
      </div>


    </div>
  );
};
