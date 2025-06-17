import dotenv from "dotenv";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export default async function createClient(config) {
    config = config || {};

    dotenv.config({ path: process.env.ENV_FILE || ".env" })

    const apiKey = config.apiKey || process.env.ARXS_API_KEY;
    const identityUrl = config.identityUrl || process.env.ARXS_IDENTITY_URL;
    const baseUrl = config.baseUrl || process.env.ARXS_BASE_URL;
    
    if (process.env.ARXS_ALLOW_DEV_CERTIFICATES) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }

    console.log(`Authenticating with ${identityUrl}...`);

    // Fetches a JWT Token used by all the API-calls from the identity endpoint using the API-key.
    const getJwtToken = async () => {
        const response = await fetch(`${identityUrl}/api/authenticate/token/${apiKey}`, {
            method: "GET",
        });
    
        if (!response.ok) {
            console.error(`Failed to retrieve JWT token: ${response.statusText}`);

            const contentType = response.headers.get("Content-Type");
            if (contentType && contentType.startsWith("application/json")) {
                const payload = await response.json();
                console.log(payload);
            }

            throw new Error("Fetch failed");
        }
    
        return await response.json();
    };
    const token = await getJwtToken();
    
    console.log("Done.")
    
    const fetchFromApi = async (path) => {
        const response = await fetch(`${baseUrl}${path}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
    
        if (!response.ok) {
            console.error(`Failed to retrieve ${path}: ${response.statusText}`);

            const contentType = response.headers.get("Content-Type");
            if (contentType && contentType.startsWith("application/json")) {
                const payload = await response.json();
                console.log(payload);
            }

            throw new Error("Fetch failed");
        }
    
        return await response.json();
    };
    const postToApi = async (path, body) => {
        const url = `${baseUrl}${path}`;
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        let payload;
        const contentType = response.headers.get("Content-Type");
        if (contentType && contentType.startsWith("application/json")) {
            payload = await response.json();
        }

        if (!response.ok) {
            console.error(`Failed to POST ${path}: ${response.statusText}`);

            if (payload) {
                console.log(payload);
            }

            throw new Error("Fetch failed");
        }

        return payload;
    };

    const filterCategoryCode = (x) => Object.entries(x).filter(x => ["SortKindAndType", "KindAndType"].includes(x[1].hierarchyType)).map(x => x[0])[0];

    const getBlobPutUrl = (fileName, fileType) => fetchFromApi(`/api/shared/blob/GetBlobPutAuthorization?fileName=${encodeURIComponent(fileName)}&type=${fileType}`);
    const uploadToCloudStorage = async (localFilePath) => {
        const fileName = path.basename(localFilePath);
        const putBlobUrl = await getBlobPutUrl(fileName, "image");

        if (!fs.existsSync(localFilePath)) {
            throw new Error(`File ${localFilePath} does not exist.`);
        }

        const fileSize = fs.statSync(localFilePath).size;
        const fileStream = fs.createReadStream(localFilePath);
        const contentType = "image/png";

        const response = await fetch(putBlobUrl, {
            method: "PUT",
            headers: {
                "x-ms-date": new Date().toISOString(),
                "x-ms-version": "2019-12-12",
                "x-ms-blob-type": "BlockBlob",
                "Content-Length": fileSize.toString(),
                "Content-Type": contentType,
            },
            body: fileStream
        });

        if (!response.ok) {
            console.error(`Failed to upload file. Status: ${response.status}, Message: ${response.statusText}`);
            
            if (response.headers.get("Content-Type") === "application/json") {
                const payload = await response.json();
                console.log(payload);
            }

            throw new Error("Fetch failed");
        }

        return putBlobUrl;
    }

    const mapToHierarchy = (codeElements) => {
        const roots = codeElements.filter(x => !x.parentId && x.code);
        const byParentId = codeElements
            .filter(x => x.parentId)
            .reduce((acc, cur) => {
                acc[cur.parentId] = (acc[cur.parentId] || []).concat([cur]);
                return acc;
            }, {});

        const getChildren = (parentId, byParentId) => {
        const children = byParentId[parentId] || [];

        for (const child of children) {
            child.children = getChildren(child.id, byParentId);
        }

        return children;
        };

        for (const root of roots) {
        root.children = getChildren(root.id, byParentId);
        }

        return roots;
    };

    const mapImageUrlToAttachmentInfo = (url) => {
        if (!url) {
            return;
        }
        
        const fileId = crypto.randomUUID();
        const contentType = "image/png"
        const fileName = "photo.png";

        return {
            attachments: [
                {
                    type: "Image",
                    value: 
                    [
                        {
                            id: fileId,
                            type: "StoredFile",
                            props: { name: fileName },
                            isDeleted: false,
                        }
                    ]
                }
            ],
            storedFiles: [
                {
                    id: fileId,
                    contentType,
                    name: fileName,
                    url: url,                                    
                }
            ]
        };
    }

    return {
        shared: {
            blob: {
                uploadToCloudStorage: uploadToCloudStorage
            },
            mapImageUrlToAttachmentInfo
        },

        masterdata: {
            legalStructure: {
                get: () => fetchFromApi("/api/masterdata/legalstructure"),
            },
            branch: {
                get: () => fetchFromApi("/api/masterdata/branch"),
            },
            employee: {
                get: () => fetchFromApi("/api/masterdata/employee"),
                post: (x) => postToApi("/api/masterdata/employee", x)
            },
            codeElement: {
                get: () => fetchFromApi("/api/masterdata/codeelements")
                    .then(mapToHierarchy),
                getCategoryCodeForModule: (module) => fetchFromApi(`/api/masterdata/codeelements/getmetadatabymodules/${module}`)
                    .then(filterCategoryCode),
            },
            userRole: {
                get: () => fetchFromApi("/api/masterdata/userrole"),
                addUsers: (userRoleId, userIds) => postToApi(`/api/masterdata/userrole/${userRoleId}/addusers`, userIds),
            }
        },

        assetManagement: {
            equipment: {
                get: () => fetchFromApi("/api/assetmanagement/equipment"),
                post: (x) => postToApi("/api/assetmanagement/equipment", x),
            }
        },

        facilityManagement: {
            taskRequest: {
                get: () => fetchFromApi("/api/facilitymanagement/taskrequest"),
                post: (x) => postToApi("/api/facilitymanagement/taskrequest", x)
            },
        },        
    };
}