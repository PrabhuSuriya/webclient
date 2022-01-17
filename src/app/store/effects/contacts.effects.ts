import { HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Actions, Effect, ofType } from '@ngrx/effects';
import { Observable, of, EMPTY } from 'rxjs';
import { catchError, map, mergeMap, switchMap } from 'rxjs/operators';

import { TranslateService } from '@ngx-translate/core';
import { OpenPgpService, UsersService } from '../services';
import {
  Accounts,
  ContactAddError,
  ContactAddSuccess,
  ContactDeleteSuccess,
  ContactGetFailure,
  ContactNotifySuccess,
  ContactNotifyFailure,
  ContactGetSuccess,
  ContactImport,
  ContactImportFailure,
  ContactImportSuccess,
  ContactsActionTypes,
  ContactsGet,
  GetEmailContacts,
  GetEmailContactsSuccess,
  SnackErrorPush,
  SnackPush,
  UpdateBatchContacts,
  UpdateBatchContactsSuccess,
  EmptyOnlyFolder,
  ContactFetchKeys,
  ContactFetchKeysSuccess,
  ContactFetchKeysFailure,
  ContactAddKeys,
  ContactAddKeysSuccess,
  ContactAddKeysFailure,
  ContactRemoveKeys,
  ContactRemoveKeysSuccess,
  ContactRemoveKeysFailure,
  ContactBulkUpdateKeys,
  ContactBulkUpdateKeysSuccess,
  ContactBulkUpdateKeysFailure,
  GetUsersKeys,
  ContactExport,
  ContactExportSuccess,
  ContactExportFailure,
  ContactAdd,
} from '../actions';
import { Contact, ImportContactResponse } from '../datatypes';

@Injectable({
  providedIn: 'root',
})
export class ContactsEffects {
  constructor(
    private actions: Actions,
    private openPgpService: OpenPgpService,
    private userService: UsersService,
    private translate: TranslateService,
  ) {}

  @Effect()
  Contact: Observable<any> = this.actions.pipe(
    ofType(ContactsActionTypes.CONTACT_GET),
    map((action: ContactsGet) => action.payload),
    switchMap(payload => {
      return this.userService.getContact(payload.limit, payload.offset, payload.q, payload.starred).pipe(
        map(response => {
          if (payload.isDecrypting) {
            response.isDecrypting = true;
            return new ContactGetSuccess(response);
          }
          let count = 0;
          const contacts: Contact[] = response.results;
          for (const contact of contacts) {
            if (contact.is_encrypted) {
              contact.is_decryptionInProgress = true;
              count += 1;
              setTimeout(() => {
                this.openPgpService.decryptContact(contact.encrypted_data, contact.id);
              }, count * 300);
            }
          }

          return new ContactGetSuccess(response);
        }),
        catchError(() => of(new ContactGetFailure())),
      );
    }),
  );

  @Effect()
  ContactAdd: Observable<any> = this.actions.pipe(
    ofType(ContactsActionTypes.CONTACT_ADD),
    switchMap((action: ContactAdd) =>
      this.userService.addContact(action.payload).pipe(
        switchMap(contact => {
          contact.isUpdating = action.payload.id;
          if (contact.is_encrypted) {
            setTimeout(() => {
              this.openPgpService.decryptContact(contact.encrypted_data, contact.id);
            }, 150);
          }
          return of(
            new ContactAddSuccess(contact),
            // new MatchContactUserKeys({ ...contact, contactAdd: true }),
            new GetUsersKeys({
              emails: contact.is_encrypted ? [action.plainTextEmail] : [contact.email],
            }),
            new SnackPush({ message: `Contact ${action.payload.id ? 'updated' : 'saved'} successfully.` }),
          );
        }),
        catchError(() =>
          of(
            new ContactAddError(),
            new SnackErrorPush({ message: `Failed to ${action.payload.id ? 'update' : 'save'} contact.` }),
          ),
        ),
      ),
    ),
  );

  @Effect()
  ContactDelete: Observable<any> = this.actions.pipe(
    ofType(ContactsActionTypes.CONTACT_DELETE),
    map((action: Accounts) => action.payload),
    switchMap(payload => {
      return this.userService.deleteContact(payload).pipe(
        switchMap(() => {
          return of(new ContactDeleteSuccess(payload), new SnackPush({ message: 'Contacts deleted successfully.' }));
        }),
        catchError(() => of(new SnackErrorPush({ message: 'Failed to delete contacts.' }))),
      );
    }),
  );

  @Effect()
  ContactNotify: Observable<any> = this.actions.pipe(
    ofType(ContactsActionTypes.CONTACT_NOTIFY),
    map((action: Accounts) => action.payload),
    switchMap(payload => {
      return this.userService.notifyContact(payload).pipe(
        switchMap(response => {
          if (response && response.length === 0) {
            return of(new SnackErrorPush({ message: 'Failed to notify' }), new ContactNotifyFailure({}));
          }
          return of(
            new EmptyOnlyFolder({ folder: 'sent' }),
            new ContactNotifySuccess(payload),
            new SnackPush({ message: 'Notification emails have been sent successfully.' }),
          );
        }),
        catchError(error => {
          return of(
            new SnackErrorPush({ message: error.error.msg ? error.error.msg : 'Failed to notify' }),
            new ContactNotifyFailure(error.error),
          );
        }),
      );
    }),
  );

  @Effect()
  ContactImport: Observable<any> = this.actions.pipe(
    ofType(ContactsActionTypes.CONTACT_IMPORT),
    map((action: ContactImport) => action.payload),
    switchMap(payload => {
      return this.userService.importContacts(payload).pipe(
        mergeMap(event => {
          if (event instanceof HttpResponse) {
            const result: ImportContactResponse = event.body;
            const message =
              result.detail === 'success'
                ? `${result.success_count} contacts imported, ${result.fail_count} contacts failed`
                : 'Failed to import contacts.';
            return of(
              new ContactImportSuccess(event.body),
              new ContactsGet({ limit: 50, offset: 0 }),
              new SnackPush({ message }),
            );
          }
          return EMPTY;
        }),
        catchError(error => {
          return of(
            new SnackErrorPush({ message: 'Failed to import contacts.' }),
            new ContactImportFailure(error.error),
          );
        }),
      );
    }),
  );

  @Effect()
  ContactExport: Observable<any> = this.actions.pipe(
    ofType(ContactsActionTypes.CONTACT_EXPORT),
    map((action: ContactExport) => action.payload),
    switchMap(payload => {
      return this.userService.exportContacts(payload).pipe(
        switchMap(event => {
          return event.status ? of(new ContactExportSuccess(event)) : of(new ContactExportFailure(event));
        }),
        catchError(error => {
          return of(
            new SnackErrorPush({ message: this.translate.instant('contacts.export_failure') }),
            new ContactExportFailure(error),
          );
        }),
      );
    }),
  );

  @Effect()
  getEmailsContactsEffect: Observable<any> = this.actions.pipe(
    ofType(ContactsActionTypes.GET_EMAIL_CONTACTS),
    map((action: GetEmailContacts) => action.payload),
    switchMap(() => {
      return this.userService.getEmailContacts().pipe(
        switchMap(response => of(new GetEmailContactsSuccess(response.results))),
        catchError(() => of(new SnackErrorPush({ message: 'Failed to get email contacts.' }))),
      );
    }),
  );

  @Effect()
  updateBatchContacts: Observable<any> = this.actions.pipe(
    ofType(ContactsActionTypes.CONTACT_BATCH_UPDATE),
    map((action: UpdateBatchContacts) => action.payload),
    switchMap(payload => {
      return this.userService.updateBatchContacts(payload).pipe(
        switchMap(() => of(new UpdateBatchContactsSuccess(payload))),
        catchError(() => of(new SnackErrorPush({ message: 'Failed to update batch contacts.' }))),
      );
    }),
  );

  @Effect()
  contactFetchKeys: Observable<any> = this.actions.pipe(
    ofType(ContactsActionTypes.CONTACT_FETCH_KEYS),
    map((action: ContactFetchKeys) => action.payload),
    switchMap(payload => {
      return this.userService.contactFetchKeys(payload).pipe(
        switchMap(response => of(new ContactFetchKeysSuccess(response))),
        catchError(error => {
          return of(new ContactFetchKeysFailure(error.error));
        }),
      );
    }),
  );

  @Effect()
  contactAddKeys: Observable<any> = this.actions.pipe(
    ofType(ContactsActionTypes.CONTACT_ADD_KEYS),
    map((action: ContactAddKeys) => action.payload),
    switchMap(payload => {
      return this.userService.contactAddKeys(payload.key).pipe(
        switchMap(response => {
          if (payload.id) {
            return of(
              new ContactAddKeysSuccess(response),
              // new MatchContactUserKeys({ ...res, email: payload.email, contactKeyUpdate: true }),
              new GetUsersKeys({
                emails: [payload.email],
              }),
              new SnackPush({ message: `Public Key with fingerprint ${payload.fingerprint} has been updated` }),
            );
          }
          return of(
            new ContactAddKeysSuccess(response),
            // new MatchContactUserKeys({ ...res, email: payload.email, contactKeyAdd: true })
            new GetUsersKeys({
              emails: [payload.email],
            }),
          );
        }),
        catchError(error => {
          return of(
            new ContactAddKeysFailure(error.error),
            new SnackErrorPush({ message: 'Failed to add public key' }),
          );
        }),
      );
    }),
  );

  @Effect()
  contactRemoveKeys: Observable<any> = this.actions.pipe(
    ofType(ContactsActionTypes.CONTACT_REMOVE_KEYS),
    map((action: ContactRemoveKeys) => action.payload),
    switchMap(payload => {
      return this.userService.contactRemoveKeys(payload.key).pipe(
        switchMap(() =>
          of(
            new ContactRemoveKeysSuccess(payload.key),
            // new MatchContactUserKeys({ ...res, email: payload.email, contactKeyRemove: true })
            new GetUsersKeys({
              emails: [payload.email],
            }),
          ),
        ),
        catchError(error => {
          return of(
            new ContactRemoveKeysFailure(error.error),
            new SnackErrorPush({ message: 'Failed to remove public key' }),
          );
        }),
      );
    }),
  );

  @Effect()
  contactBulkUpdateKeys: Observable<any> = this.actions.pipe(
    ofType(ContactsActionTypes.CONTACT_BULK_UPDATE_KEYS),
    map((action: ContactBulkUpdateKeys) => action.payload),
    switchMap(payload => {
      return this.userService.contactBulkUpdateKeys(payload).pipe(
        switchMap(() => of(new ContactBulkUpdateKeysSuccess(payload))),
        catchError(error => {
          return of(
            new ContactBulkUpdateKeysFailure(error.error),
            new SnackErrorPush({ message: 'Failed to update advanced settings' }),
          );
        }),
      );
    }),
  );
}
