import "dotenv/config";
import fetch from "node-fetch";
import fs from 'fs';
import path from 'path';
import crypto from "crypto";

const API_KEY = process.env.ARXS_API_KEY;
const IDENTITY_URL = process.env.ARXS_IDENTITY_URL;
const BASE_URL = process.env.ARXS_BASE_URL;

// Fetches a JWT Token used by all the API-calls from the identity endpoint using the API-key.
const getJwtToken = async () => {
    const response = await fetch(`${IDENTITY_URL}/api/authenticate/token/${API_KEY}`, {
        method: 'GET',
    });

    if (!response.ok) {
        throw new Error(`Failed to retrieve JWT token: ${response.statusText}`);
    }

    return await response.json();
};
const token = await getJwtToken();

const fetchFromApi = async (path) => {
    const response = await fetch(`${BASE_URL}${path}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to retrieve ${path}: ${response.statusText}`);
    }

    return await response.json();
};

const getEmployees = () => fetchFromApi("/api/masterdata/employee");

const filterCategoryCode = (x) => Object.entries(x).filter(x => ["SortKindAndType", "KindAndType"].includes(x[1].hierarchyType)).map(x => x[0])[0];
const getCategoryCodeForModule = async (module) => fetchFromApi(`/api/masterdata/codeelements/getmetadatabymodules/${module}`).then(filterCategoryCode);
const getPutBlobUrl = (fileName, fileType) => fetchFromApi(`/api/shared/blob/GetBlobPutAuthorization?fileName=${encodeURIComponent(fileName)}&type=${fileType}`);

const uploadToAzureBlob = async (filePath) => {
    const fileName = path.basename(filePath);
    const putBlobUrl = await getPutBlobUrl(fileName, "image");

    if (!fs.existsSync(filePath)) {
        throw new Error(`File ${filePath} does not exist.`);
    }

    const fileSize = fs.statSync(filePath).size;
    const fileStream = fs.createReadStream(filePath);
    const contentType = "image/png";

    const response = await fetch(putBlobUrl, {
        method: 'PUT',
        headers: {
            'x-ms-date': new Date().toISOString(),
            'x-ms-version': '2019-12-12',
            'x-ms-blob-type': 'BlockBlob',
            'Content-Length': fileSize.toString(),
            'Content-Type': contentType,
        },
        body: fileStream
    });

    if (!response.ok) {
        throw new Error(`Failed to upload file. Status: ${response.status}, Message: ${response.statusText}`);
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

const getCodeElements = () => fetchFromApi("/api/masterdata/codeelements").then(mapToHierarchy);

const getEquipments = () => fetchFromApi("/api/assetmanagement/equipment");

const createTaskRequest = async (body) => {
    const url = `${BASE_URL}/api/facilitymanagement/taskrequest`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const payload = await response.json();
        console.log(payload);
        throw new Error(`Failed to create task request: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
};


const userName = "arxssolutions";
const module = "NotificationDefect";
const kindString = "Onderhoud/herstelling";
const typeString = "Elektriciteit";
const subjectUniqueNumber = "UIN-004095";

// In order to retrieve a specific employee based on its username, currently we need to filter client-side.
// Future releases of the API will extend on the filtering capabilities of the GET endpoints.
const employees = await getEmployees();
const notifier = employees.filter(x => x.userName === userName)[0];

// CodeElements are generic settings used by every module.
// They are hierarchical (self-referential via ParentId). As such we build up the hierarchy from the flat list of CodeElements that we receive.
// In order to know which hierarchy to use for the module we're working with, we query for that module's specific metadata.
const codeElements = await getCodeElements();
const moduleCategory = await getCategoryCodeForModule(module);
const moduleCodeElements = codeElements.filter(x => x.code === moduleCategory)[0].children;
const kind = moduleCodeElements.filter(x => x.name === kindString)[0];
const type = kind.children[0].children.filter(x => x.name === typeString)[0];

// In order to retrieve a specific equipment based on its uniqueNumber, currently we need to filter client-side.
// Future releases of the API will extend on the filtering capabilities of the GET endpoints.
const subject = (await getEquipments()).filter(x => x.uniqueNumber === subjectUniqueNumber)[0];

// const imageUrl = "https://intern.arxs.be/images/img_macbook.png";
const imageUrl = await uploadToAzureBlob("./img_macbook.png");

const attachmentInfo = mapImageUrlToAttachmentInfo(imageUrl);

const data = {
    tags: [],
    notifier: { id: notifier.id, module: "Employee" },
    title: "Titel",
    description: "Omschrijving",
    subjects: [{ id: subject.id, module: "EquipmentInstallation" }],
    kind: { id: kind.id },
    type: { id: type.id },
    geoLocation: {
        street: "Sint-Agatha-Berchemselaan",
        number: "3",
        zipCode: "1081",
        city: "Koekelberg",
        latitude: 50.86499984826551,
        longitude: 4.318274640784401
    },
    attachmentInfo,
};

const taskResponse = await createTaskRequest(data);
console.log('Task Request Created:', taskResponse);
